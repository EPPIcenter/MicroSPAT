import numpy as np
from sklearn.cluster import MeanShift


def find_clusters(feature, items, bandwidth=None, min_bin_freq=None, cluster_all=True):
    x = [item[feature] for item in items]
    X = np.array(zip(x, np.zeros(len(x))), dtype=np.float)
    ms = MeanShift(bandwidth=bandwidth, min_bin_freq=min_bin_freq, cluster_all=cluster_all)
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


