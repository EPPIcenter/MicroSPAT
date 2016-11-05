# coding=utf-8
import numpy as np
from sklearn.linear_model import TheilSenRegressor, LinearRegression, RANSACRegressor
from sklearn.metrics import mean_squared_error, r2_score

from app.microspat.cluster.FeatureCluster import find_clusters


class ArtifactEstimatorSet(object):
    def __init__(self, artifact_estimators=None):
        if artifact_estimators is None:
            artifact_estimators = []

        self.artifact_estimators = artifact_estimators

    @classmethod
    def from_peaks(cls, peak_sets, start_size, end_size, min_artifact_peak_frequency=10, nucleotide_repeat_length=3):
        """
        Given a list of sets of peaks, will identify potential artifact relationships and generate a set of
        estimators.

        peak_set = peak[]

        peak = {
            'peak_height': int,
            'peak_size': int,
            'relative_peak_height': int
        }

        :rtype: ArtifactEstimatorSet
        :type peak_sets: list of sets of peaks. Each set is drawn from exactly one run and indicates all peaks
        identified for that given run
        :type start_size: starting base size range
        :type end_size: ending base size range
        :type min_artifact_peak_frequency: minimum number of artifact peaks to establish potential relationship
        :type nucleotide_repeat_length: length of microsatellite repeat and expected distance (or common multiple of) of
        artifact due to PCR error.
        :return ArtifactEstimatorSet containing artifact estimators for clustered artifact distances
        """
        generator_params = [{'start_size': start_size,
                             'end_size': end_size,
                             'method': 'TSR'
                             }]

        cluster_set = []
        for peak_set in peak_sets:
            if peak_set:
                max_peak = [peak for peak in peak_set if peak['relative_peak_height'] == 1]
                max_peak = max_peak[0]
                for peak in peak_set:
                    peak['dist_from_max_peak'] = peak['peak_size'] - max_peak['peak_size']
                cluster_set += peak_set

        cluster_set = [_ for _ in cluster_set if _['relative_peak_height'] < 1]

        clusters = find_clusters('dist_from_max_peak', cluster_set, bandwidth=nucleotide_repeat_length * .5,
                                 min_bin_freq=min_artifact_peak_frequency, cluster_all=False)

        artifact_estimators = []
        for cluster in clusters:
            if cluster['center'] != 0:
                artifact_distance = cluster['center']
                artifact_distance_buffer = cluster['sd']
                peak_subset = []
                temp = []
                while cluster_set:
                    peak = cluster_set.pop()
                    if abs(peak['dist_from_max_peak'] - artifact_distance) < artifact_distance_buffer * 2 and peak['relative_peak_height'] != 1:
                        peak_subset.append(peak)
                    else:
                        temp.append(peak)

                # peak_subset = [peak for peak in cluster_set if
                #                abs(peak['dist_from_max_peak'] - artifact_distance) < artifact_distance_buffer * 3 and
                #                peak['relative_peak_height'] != 1]

                if len(peak_subset) >= min_artifact_peak_frequency:
                    artifact_estimator = ArtifactEstimator(artifact_distance=artifact_distance,
                                                           artifact_distance_buffer=max(artifact_distance_buffer * 3,
                                                                                        .5),
                                                           peak_data=peak_subset)

                    artifact_estimator.artifact_equations = artifact_estimator.generate_estimating_equations(generator_params)
                    artifact_estimators.append(artifact_estimator)
                else:
                    temp += peak_subset
                cluster_set = temp
        if cluster_set:
            artifact_estimator = ArtifactEstimator(artifact_distance=None, artifact_distance_buffer=None,
                                                   peak_data=cluster_set, label="Global Artifact")
            generator_params[0]['method'] = 'RANSAC'
            artifact_estimator.artifact_equations = artifact_estimator.generate_estimating_equations(generator_params)
            artifact_estimators.append(artifact_estimator)
        return cls(artifact_estimators=artifact_estimators)

    def annotate_artifact(self, peak_set):
        """
        Annotate peak artifact contribution and estimated error for given set of annotated peaks. Error is defined as 1
        standard deviation from the estimate based on artifact estimator model.

        peak = {
            peak_size: int,
            peak_height: int
        }

        :param peak_set: list of annotated peaks
        :return: list of peaks with artifact annotation.

        peak = {
            peak_size: int,
            peak_height: int,
            artifact_contribution: int,
            artifact_error: float
        }
        """
        for peak in peak_set:
            peak['artifact_contribution'] = peak.get('artifact_contribution', 0)
            peak['artifact_error'] = peak.get('artifact_error', 0)
        for estimator in self.artifact_estimators:
            assert isinstance(estimator, ArtifactEstimator)
            estimator.annotate_artifact(peak_set)
        return peak_set


class ArtifactEstimator(object):
    def __init__(self, artifact_distance, artifact_distance_buffer, peak_data=None, artifact_equations=None, label=None):
        """
        ArtifactEstimator estimates the artifact contribution to a peak falling a relative distance of artifact_distance
        +/- the artifact_distance_buffer from another peak
        :return: An Artifact Estimator
        """
        if peak_data is None:
            peak_data = []
        if artifact_equations is None:
            artifact_equations = []
        if label is None:
            label = str(artifact_distance)

        self.artifact_distance = artifact_distance
        self.artifact_distance_buffer = artifact_distance_buffer
        self.peak_data = peak_data
        self.artifact_equations = artifact_equations
        self.label = label

    def generate_estimating_equations(self, parameter_sets, peak_data=None):
        """
        Generates artifact estimating equations for given sets of parameters
        :param parameter_sets: dict

        parameter_set = {
            start_size: float,
            end_size: float,
            method: string ϵ ['LSR', 'TSR', 'RANSAC', 'no_slope']
        }

        method provided determines the regression model used.
        LSR -> Least Squares Regression
        TSR -> Theil-Sen Regression
        RANSAC -> Random sample consensus using LSR
        no_slope -> mean of artifact as estimate

        :param peak_data: list of peaks

        peak = {
            peak_size: int
        }

        :return: ArtifactEquation[]
        """
        print "REGENERATING ESTIMATING EQUATIONS"
        if peak_data:
            self.peak_data = peak_data
        artifact_equations = []
        for parameter_set in parameter_sets:
            start_size = parameter_set['start_size']
            end_size = parameter_set['end_size']
            method = parameter_set.get('method', None)
            peak_subset = [peak for peak in self.peak_data if start_size < peak['peak_size'] <= end_size]
            if peak_subset:
                artifact_equation = ArtifactEquation.from_peaks(peak_subset, start_size, end_size, method)
                artifact_equations.append(artifact_equation)
        return artifact_equations

    def annotate_artifact(self, peaks):
        """
        Iterates over set of peaks and for each peak, annotates all surrounding peaks that fall within artifact
        estimator distance + buffer.

        :param peaks: peaks to be annotated

        peak = {
            peak_size: int,
            peak_height: int
        }

        :return: Annotated Peaks

        annotated_peak = {
            peak_size: int,
            peak_height: int,
            artifact_contribution: float,
            artifact_error: float
        }
        """

        if self.artifact_distance:
            peaks.sort(key=lambda x: x['peak_size'])
            for main_peak in peaks:
                for artifact_peak in peaks:
                    peak_distance = artifact_peak['peak_size'] - main_peak['peak_size']
                    if peak_distance > (self.artifact_distance + self.artifact_distance_buffer):
                        break
                    else:
                        if abs(peak_distance - self.artifact_distance) < self.artifact_distance_buffer:
                            for eq in self.artifact_equations:
                                if eq.start_size < main_peak['peak_size'] <= eq.end_size:
                                    eq.annotate_artifact(main_peak, artifact_peak)
        else:  # Treat as global artifact
            main_peak = max(peaks, key=lambda _: _.get('peak_height'))
            for peak in peaks:
                if peak != main_peak:
                    for eq in self.artifact_equations:
                        if eq.start_size < main_peak['peak_size'] <= eq.end_size:
                            eq.annotate_artifact(main_peak, peak)


class ArtifactEquation(object):
    def __init__(self, sd, r_squared, slope, intercept, start_size, end_size, method=None):
        self.sd = sd
        self.r_squared = r_squared
        self.start_size = start_size
        self.end_size = end_size
        self.slope = slope
        self.intercept = intercept
        self.method = method

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

        return cls(start_size=start_size, end_size=end_size, method=method, **model)

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
