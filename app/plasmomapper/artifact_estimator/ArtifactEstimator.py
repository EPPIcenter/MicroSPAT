import numpy as np
from sklearn.linear_model import TheilSenRegressor, LinearRegression, RANSACRegressor
from sklearn.metrics import mean_squared_error, r2_score

from app.plasmomapper.cluster.ClusterModel import find_clusters


class ArtifactEstimatorSet(object):
    def __init__(self, artifact_estimators=None):
        if artifact_estimators is None:
            artifact_estimators = []

        self.artifact_estimators = artifact_estimators

    @classmethod
    def from_peaks(cls, peak_sets, start_size, end_size, min_artifact_peak_frequency=10, nucleotide_repeat_length=3):
        """
        Given a list of dicts of annotated peaks, will identify potential artifact relationships and generate a set of
        estimators. List of peaks should be from single strain samples.
        :rtype: ArtifactEstimatorSet
        :type peak_sets: list
        :type start_size: float
        :type end_size: float
        :type min_artifact_peak_frequency: int
        :type nucleotide_repeat_length: int
        """
        generator_params = [{'start_size': start_size,
                             'end_size': end_size,
                             'method': 'TSR'
                             }]

        cluster_set = []
        for peak_set in peak_sets:
            if peak_set:
                max_peak = max(peak_set, key=lambda x: x['peak_height'])
                for peak in peak_set:
                    # peak['relative_peak_height'] = peak['peak_height'] / float(max_peak['peak_height'])
                    peak['dist_from_max_peak'] = peak['peak_size'] - max_peak['peak_size']
                cluster_set += peak_set

        clusters = find_clusters('dist_from_max_peak', cluster_set, bandwidth=nucleotide_repeat_length * .5,
                                 min_bin_freq=min_artifact_peak_frequency, cluster_all=False)

        artifact_estimators = []
        for cluster in clusters:
            if cluster['center'] != 0:
                artifact_distance = cluster['center']
                artifact_distance_buffer = cluster['sd']
                peak_subset = [peak for peak in cluster_set if
                               abs(peak['dist_from_max_peak'] - artifact_distance) < artifact_distance_buffer * 3]
                if len(peak_subset) >= min_artifact_peak_frequency:
                    artifact_estimator = ArtifactEstimator(artifact_distance=artifact_distance,
                                                           artifact_distance_buffer=max(artifact_distance_buffer * 3,
                                                                                        .5),
                                                           peak_data=peak_subset)

                    artifact_estimator.artifact_equations = artifact_estimator.generate_estimating_equations(
                        generator_params)
                    artifact_estimators.append(artifact_estimator)
        return cls(artifact_estimators=artifact_estimators)

    def annotate_artifact(self, annotated_peaks):
        for peak in annotated_peaks:
            peak['artifact_contribution'] = peak.get('artifact_contribution', 0)
            peak['artifact_error'] = peak.get('artifact_error', 0)
        for estimator in self.artifact_estimators:
            assert isinstance(estimator, ArtifactEstimator)
            estimator.annotate_artifact(annotated_peaks)
        return annotated_peaks


class ArtifactEstimator(object):
    def __init__(self, artifact_distance, artifact_distance_buffer, peak_data=None, artifact_equations=None):
        """
        ArtifactEstimator estimates the artifact contribution to a peak falling a relative distance of artifact_distance
        +/- the artifact_distance_buffer from another peak
        :param artifact_distance:
        :param artifact_distance_buffer:
        :return:
        """
        if peak_data is None:
            peak_data = []
        if artifact_equations is None:
            artifact_equations = []

        self.artifact_distance = artifact_distance
        self.artifact_distance_buffer = artifact_distance_buffer
        self.peak_data = peak_data
        self.artifact_equations = artifact_equations

    def generate_estimating_equations(self, parameter_sets):
        artifact_equations = []
        for parameter_set in parameter_sets:
            start_size = parameter_set['start_size']
            end_size = parameter_set['end_size']
            method = parameter_set['method']
            peak_subset = [peak for peak in self.peak_data if start_size < peak['peak_size'] <= end_size]
            if peak_subset:
                artifact_equation = ArtifactEquation.from_peaks(peak_subset, start_size, end_size, method)
                artifact_equations.append(artifact_equation)
        return artifact_equations

    def annotate_artifact(self, annotated_peaks):
        annotated_peaks.sort(key=lambda x: x['peak_size'])

        for main_peak in annotated_peaks:
            for artifact_peak in annotated_peaks:
                peak_distance = artifact_peak['peak_size'] - main_peak['peak_size']
                if peak_distance > (self.artifact_distance + self.artifact_distance_buffer):
                    break
                elif abs(peak_distance - self.artifact_distance) < self.artifact_distance_buffer:
                    for eq in self.artifact_equations:
                        if eq.start_size < main_peak['peak_size'] <= eq.end_size:
                            eq.annotate_artifact(main_peak, artifact_peak)


class ArtifactEquation(object):
    def __init__(self, sd, r_squared, slope, intercept, start_size, end_size):
        self.sd = sd
        self.r_squared = r_squared
        self.start_size = start_size
        self.end_size = end_size
        self.slope = slope
        self.intercept = intercept

    def annotate_artifact(self, annotated_main_peak, annotated_artifact_peak):
        artifact_estimate = (self.slope * annotated_main_peak['peak_size'] + self.intercept) * \
                            annotated_main_peak['peak_height']
        artifact_error = self.sd * annotated_main_peak['peak_height']

        annotated_artifact_peak['artifact_contribution'] = annotated_artifact_peak.get('artifact_contribution',
                                                                                       0) + max(artifact_estimate, 0)
        annotated_artifact_peak['artifact_error'] = annotated_artifact_peak.get('artifact_error', 0) + max(artifact_error, 0)

    @classmethod
    def from_peaks(cls, peaks, start_size, end_size, method='TSR'):
        methods = {
            'LSR': cls.calculate_lsr,
            'TSR': cls.calculate_tsr,
            'RANSAC': cls.calculate_ransac,
            'no_slope': cls.calculate_no_slope
        }

        m = methods.get(method)

        if not method:
            raise AttributeError("Method {} is not a valid method, use one of {}".format(method, str(methods.keys())))

        model = m(peaks)

        return cls(start_size=start_size, end_size=end_size, **model)

    @staticmethod
    def linear_regression(pts, regressor):
        x = np.array([a['peak_size'] for a in pts])
        y = np.array([b['relative_peak_height'] for b in pts])
        X = x[:, np.newaxis]

        regressor.fit(X, y)
        regressor_mse = mean_squared_error(y, regressor.predict(X)) ** .5
        regressor_r2 = r2_score(y, regressor.predict(X))

        return {
            'intercept': regressor.intercept_,
            'r_squared': regressor_r2,
            'slope': regressor.coef_[0],
            'sd': regressor_mse
        }

    @staticmethod
    def ransac_regression(pts, regressor):
        ransac = RANSACRegressor(regressor)
        x = np.array([a['peak_size'] for a in pts])
        y = np.array([b['relative_peak_height'] for b in pts])
        X = x[:, np.newaxis]

        ransac.fit(X, y)
        inlier_mask = ransac.inlier_mask_
        ransac_mse = mean_squared_error(y[inlier_mask], ransac.predict(X[inlier_mask])) ** .5
        ransac_r2 = r2_score(y[inlier_mask], ransac.predict(X[inlier_mask]))

        return {
            'intercept': ransac.estimator_.intercept_,
            'r_squared': ransac_r2,
            'slope': ransac.estimator_.coef_[0],
            'sd': ransac_mse
        }

    @staticmethod
    def no_slope(pts):
        return {
            'intercept': np.average([a['relative_peak_height'] for a in pts]),
            'r_squared': 0,
            'slope': 0,
            'sd': np.std([b['relative_peak_height'] for b in pts])
        }

    @classmethod
    def calculate_lsr(cls, pts):
        regressor = LinearRegression()
        return cls.linear_regression(pts, regressor)

    @classmethod
    def calculate_tsr(cls, pts):
        regressor = TheilSenRegressor()
        return cls.linear_regression(pts, regressor)

    @classmethod
    def calculate_ransac(cls, pts):
        regressor = LinearRegression()
        return cls.ransac_regression(pts, regressor)

    @classmethod
    def calculate_no_slope(cls, pts):
        return cls.no_slope(pts)
