---
title: 'ENet-21: An Optimized Light CNN Structure for Lane Detection'
authors: ['Seyed Rasoul Hosseini', 'Hamid Taheri', 'Mohammad Teshnehlab']
venue: 'arXiv · cs.CV'
status: 'Preprint · Under review (Int. J. of Mechatronics and Automation)'
year: 2024
arxiv: '2403.19782'
abstract: >
  This study develops an optimized, lightweight CNN for lane detection that combines binary
  segmentation with Affinity Fields. Lane instances are recovered by clustering the
  segmentation and affinity outputs, which lets the method handle a varying number of lanes
  and lane-change scenarios without a fixed lane-count assumption. Using a less complex
  network than existing approaches, the method is demonstrated on the TuSimple dataset.
tags: ['Computer Vision', 'Lane Detection', 'Segmentation', 'Efficient CNN']
links:
  - { label: 'arXiv:2403.19782', url: 'https://arxiv.org/abs/2403.19782' }
  - { label: 'DOI', url: 'https://doi.org/10.48550/arXiv.2403.19782' }
featured: true
order: 2
---

A study in **efficient perception**: getting robust lane understanding from a network small
enough to be practical, without giving up flexibility on the number of lanes.

## Approach

- **Binary segmentation + Affinity Fields.** Pixels are segmented as lane / non-lane, while
  affinity fields encode which pixels belong to the same lane instance.
- **Clustering for instances.** Lanes are recovered by clustering the segmentation and
  affinity outputs — so the method is not locked to a fixed lane count and naturally handles
  lane-change scenarios.
- **Lightweight by design.** A less complex CNN than comparable approaches, evaluated on the
  **TuSimple** benchmark.
