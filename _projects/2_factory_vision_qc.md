---
layout: page
title: Factory Vision QC Platform
description: Real-time object and anomaly detection for inline quality control at Schwarz IT KG.
category: research
importance: 2
---

During my internship at Schwarz IT KG I built a modular computer vision platform that monitors production lines. The system combines a YOLO-based detector with an autoencoder-style anomaly head so that both known defect classes and never-seen-before issues can be flagged. I automated dataset versioning, annotation quality checks, and TensorRT export so that we could benchmark updates within hours.

Edge deployments stream telemetry into Grafana dashboards, making it straightforward for process engineers to see model drift and downtime. The pipeline now supports multiple product families with configurable latency budgets and has been validated on pre-production lines.

<!-- TODO: Add link to internal repo or public write-up when available. -->

**Tech stack:** PyTorch, TensorRT, OpenCV, Python, Docker, Grafana, Edge AI toolchains
