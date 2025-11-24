---
layout: page
title: NavBot-PPO
description: Safe navigation policies for nonholonomic robots leveraging curriculum-guided PPO.
category: research
importance: 1
github: https://github.com/hamidthri/navbot_ppo
related_publications: true
---

NavBot-PPO is the research codebase that powered my master's thesis on safe mobile robot navigation. I rewrote proximal policy optimization from the ground up to support multiple critics, n-step returns, and adaptive noise shaping so that LiDAR-equipped robots could learn obstacle-aware trajectories in cluttered labs.

I designed a curriculum that automatically increases trajectory complexity, injected synthetic perturbations for robustness, and integrated the stack with ROS/Gazebo for repeatable experiments. The system reduced collision rates by 38% over the baseline PPO implementation while converging 25% faster on the same compute budget.

**Tech stack:** Python, PyTorch, ROS, Gazebo, NumPy, Weights & Biases
