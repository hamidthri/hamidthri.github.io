---
title: 'Deep Reinforcement Learning with Enhanced PPO for Safe Mobile Robot Navigation'
authors: ['Hamid Taheri', 'Seyed Rasoul Hosseini', 'Mohammad Ali Nekoui']
venue: 'arXiv · cs.RO'
status: 'Preprint · Under review (Int. J. of Intelligent Machines and Robotics)'
year: 2024
arxiv: '2405.16266'
abstract: >
  This study trains a deep reinforcement learning agent to enable a wheeled mobile robot to
  navigate autonomously and collision-free toward a target in complex, obstacle-rich
  environments. Using only raw LiDAR observations and the goal pose, a deep neural network
  maps perception directly to continuous velocity commands. The work compares DDPG and PPO
  and introduces an enhanced PPO network architecture together with a tailored reward
  function, validated in both obstacle and obstacle-free Gazebo environments.
tags: ['Deep RL', 'PPO', 'Mobile Robots', 'LiDAR', 'Navigation']
links:
  - { label: 'arXiv:2405.16266', url: 'https://arxiv.org/abs/2405.16266' }
  - { label: 'DOI', url: 'https://doi.org/10.48550/arXiv.2405.16266' }
  - { label: 'Code · navbot_ppo', url: 'https://github.com/hamidthri/navbot_ppo' }
video: '/media/navbot_navigation.mp4'
poster: '/media/navbot_navigation_poster.jpg'
featured: true
order: 1
---

This paper sits at the core of my research direction: **learning-based control for safe
autonomous navigation**. Rather than relying on a hand-built map and classical planner, the
agent learns an end-to-end policy that reads sparse LiDAR returns plus the relative goal and
outputs continuous linear and angular velocity.

## Approach

- **Observation → action, end-to-end.** A deep network consumes LiDAR beams and the target
  pose and directly emits continuous control — no SLAM, no occupancy grid.
- **DDPG vs PPO.** Both continuous-control algorithms are evaluated; PPO proves more stable
  for this task.
- **Enhanced PPO.** A modified network architecture and a reward function tailored to
  collision avoidance and goal-reaching improve navigation performance.
- **Validation.** Tested across obstacle and obstacle-free environments in Gazebo.

The companion implementation is open-sourced as
[`navbot_ppo`](https://github.com/hamidthri/navbot_ppo) — a mapless motion planner for a
TurtleBot in a Dockerized Gazebo setup.
