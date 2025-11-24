---
layout: page
title: MiniRT Renderer
description: Lightweight ray tracer implementing physically based shading for 42 Heilbronn.
category: systems
importance: 5
github: https://github.com/hamidthri/miniRT
---

MiniRT is my implementation of a realtime-ish ray tracer in C. It parses a custom scene description, constructs BVHs for acceleration, and supports reflections, refractions, soft shadows, and limited global illumination. I used the project to sharpen my numerical robustness skills and to profile cache-heavy workloads on bare-metal Linux.

To keep it teachable, I modularized the math library, added unit tests for intersection routines, and introduced debug visualizations that color objects by normal direction or bounce count. The renderer feeds directly into later robotics experiments where depth estimation and lighting simulations matter.

**Tech stack:** C, MiniLibX, Linear Algebra, Git, Valgrind, Makefile
