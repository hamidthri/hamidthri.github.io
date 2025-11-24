---
layout: page
title: 42 Inception Platform
description: Dockerized micro-services lab with TLS, monitoring, and automated provisioning.
category: systems
importance: 4
github: https://github.com/hamidthri/inception
---

In the Inception project at 42 Heilbronn I orchestrated multiple services (nginx, WordPress, MariaDB, Redis, and custom utilities) using Docker and docker-compose. The lab emphasizes writing reproducible infrastructure-as-code, so I created Makefile automation, secrets management, and health checks that teammates reuse for their own stacks.

The platform now spins up in under two minutes on a clean machine, includes Prometheus exporters for metrics, and runs behind a hardened nginx TLS proxy. I also wrote companion documentation so peers can trace how services authenticate and share volumes.

**Tech stack:** Docker, docker-compose, NGINX, MariaDB, Redis, Bash, Makefile, TLS/PKI
