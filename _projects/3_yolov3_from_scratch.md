---
layout: page
title: YOLOv3 from Scratch
description: Educational implementation of the Darknet-53 detector with modern training tricks.
category: research
importance: 3
github: https://github.com/hamidthri/YoloV3_from_scratch
---

I wrote the YOLOv3 architecture from first principles to better understand deployment trade-offs. The repository includes a faithful Darknet-53 backbone, custom dataloaders with mosaic and mixup augmentation, label smoothing, and cosine learning-rate schedules. It supports both COCO and custom datasets with configurable anchors.

Training scripts expose hooks for quantization-aware training and half-precision acceleration, which made it easy to port insights into industrial projects. The repo doubles as a teaching aid for peers who want to dissect state-of-the-art detectors without opaque dependencies.

**Tech stack:** Python, PyTorch, Albumentations, CUDA, TensorBoard
