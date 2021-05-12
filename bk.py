import sys
import numpy as np
import pandas as pd
import random
import math
from tqdm import tqdm
from shapely.geometry import Point, Polygon
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt

POP_SIZE = 5000
DELTA = 50

def run(file, digs):
    pop_size = POP_SIZE
    delta = DELTA
    boringen = ['BOR05', 'BOR20', 'PB']

    clusters = k_means(file, digs, delta)

    pop = init_population(clusters, digs, pop_size)

    fitness = np.array([])
    for p in tqdm(pop):
        fitness = np.append(fitness, calc_fitness(p))

    max_i = np.argmax(fitness)

    result = np.array(list(zip(
        ['%03d' % (i + 1) for i in range(np.sum(digs))],
        ['%1.4f' % i for i in pop[max_i][:, 0]],
        ['%1.4f' % i for i in pop[max_i][:, 1]],
        [0.0 for i in pop[max_i]],
        [boringen[int(i)] for i in pop[max_i][:, 2]]

    )))

    np.savetxt(file.split('.')[-2] + '_resultaat.csv', result, fmt='%s', delimiter=',')

    plot(file, pop[max_i])


def k_means(fileName, digs, delta):
    fileName = fileName
    delta = delta

    df = pd.read_csv(fileName, delimiter='\t')
    xs = df['Position X'].to_numpy()
    ys = df['Position Y'].to_numpy()
    contour = np.column_stack((xs, ys))

    # print('TODO! in de code')
    # contour = contour[1:] # TODO: Delete this row

    # plt.figure(figsize=(10,10))
    poly = Polygon(contour)
    minx = min(xs)
    maxx = max(xs)
    miny = min(ys)
    maxy = max(ys)
    points = np.array([])
    for i in range(delta + 1):
        for j in range(delta + 1):
            x = minx + (((maxx - minx) * i) // delta)
            y = miny + (((maxy - miny) * j) // delta)
            p = Point(x, y)
            if poly.contains(p):
                points = np.append(points, [x, y])

    points = points.reshape(len(points) // 2, 2)

    kmeans = KMeans(init='k-means++', n_clusters=np.sum(digs))
    kmeans.fit(points)

    return  kmeans.cluster_centers_


def init_population(clusters, digs, pop_size):
    population = np.array([])
    for s in tqdm(range(pop_size)):
        individual = np.array([])
        r = random.sample(range(len(clusters)), len(clusters))
        index = 0
        for c in range(len(digs)):
            for i in range(digs[c]):
                if len(individual) > 0:
                    individual = np.vstack((individual, np.append(clusters[r[index]], c)))
                else:
                    individual = np.append(clusters[r[index]], c)
                index += 1
        if len(population) > 0:
            population = np.append(population, individual).reshape(s+1,len(clusters),3)
        else:
            population = individual
    return population


def calc_fitness(pop):
    f = 0
    for i1 in range(len(pop)):
        for i2 in range(i1+1, len(pop)):
            if pop[i1, 2] == pop[i2, 2]:
                f += math.sqrt((pop[i1, 0] - pop[i2, 0])**2 + (pop[i1, 1] - pop[i2, 1])**2)/digs[int(pop[i1,2])]
    return f


def plot(file, p):
    for c in p:
        if c[2] == 0:
            plt.scatter(c[0], c[1], facecolors='none', edgecolors='r')
        elif c[2] == 1:
            plt.scatter(c[0], c[1], c='g')
        else:
            plt.scatter(c[0], c[1], c='b')
    plt.savefig(file.split('.')[-2] + '_afbeelding')


if __name__ == '__main__':
    file = sys.argv[1]
    digs = [int(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4])]
    run(file, digs)