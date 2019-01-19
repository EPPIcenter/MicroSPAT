"""
    MicroSPAT is a collection of tools for the analysis of Capillary Electrophoresis Data
    Copyright (C) 2016  Maxwell Murphy

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
"""

import numpy as np
from sklearn.cluster import MeanShift


def find_clusters(feature, items, bandwidth=None, min_bin_freq=None, cluster_all=True, n_jobs=1):
    """
    Cluster list of items based on feature using meanshift algorithm (Binning).

    :param feature: key used to retrieve item to cluster on
    :param items:
    :param bandwidth:
    :param min_bin_freq:
    :param cluster_all:
    :return:
    """
    x = [item[feature] for item in items]
    X = np.array(list(zip(x, np.zeros(len(x)))), dtype=np.float)
    ms = MeanShift(bandwidth=bandwidth, min_bin_freq=min_bin_freq, cluster_all=cluster_all, n_jobs=n_jobs)
    ms.fit(X)

    labels = ms.labels_
    labels_unique = np.unique(labels)

    n_clusters_ = len(labels_unique)

    clusters = []

    for k in range(n_clusters_):
        if k != -1:
            my_members = labels == k
            cluster_center = np.median(X[my_members, 0])
            cluster_sd = np.std(X[my_members, 0])
            clusters.append({
                'center': cluster_center,
                'sd': cluster_sd,
                'items': X[my_members, 0]
            })

    return clusters
