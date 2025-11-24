---
layout: post
title: Building NavBot-PPO for Safer Mobile Robots
description: Lessons from redesigning PPO to handle tight indoor navigation constraints.
tags: [deep reinforcement learning, robotics]
categories: [research]
---

I set out to answer a simple question for my thesis: _what does it take for a mobile robot to plan safe trajectories in unstructured labs without overfitting to simulation?_ That question became **NavBot-PPO**, a re-imagined PPO baseline built on PyTorch, ROS, and Gazebo.

Key ingredients:

1. **Curriculum scheduling.** I scripted a difficulty ramp that injects denser obstacle layouts only after the policy crosses a safety threshold. It kept training stable even when replay buffers were noisy.
2. **Risk-aware critics.** Additional critics estimate collision likelihood so the actor can down-weight risky turns without freezing.
3. **Sensing augmentation.** LiDAR dropout, Gaussian range noise, and random resets improved sim-to-real transfer when testing in the lab.

The result: 38% fewer collisions and roughly 25% faster convergence compared to the standard PPO baseline on the same GPU. Next, I am exploring how these techniques compose with diffusion-based planners.
