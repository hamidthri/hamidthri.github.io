---
layout: post
title: Deploying Vision for Inline Quality Control
description: A field note from shipping multi-camera inspection models at Schwarz IT KG.
tags: [computer vision, quality control]
categories: [engineering]
---

Schwarz IT KG asked our team to spot micro-defects on packaging lines in real time. We ended up with a hybrid detector: YOLOv8 for known issues plus an autoencoder head that flags anomalies the detector has never seen.

A few takeaways:

- **Data beats cleverness.** We built a labeling rubric, automated noisy label detection, and logged lighting metadata so we could replay failures.
- **Edge telemetry matters.** Each deployment publishes FPS, GPU utilization, and alert density into Grafana so operators can trust the model before escalating.
- **TensorRT saves watts.** Converting both heads to TensorRT cut latency by 35% and kept thermals inside the allowable envelope on our industrial PCs.

The platform now runs across multiple product families and serves as a template for future manufacturing lines.
