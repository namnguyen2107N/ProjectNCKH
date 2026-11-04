/**
 * ROBOT MATH LAB - KINEMATICS MODEL
 * Pure simulation math shared by the 2D canvas renderer and the 3D renderer.
 * No DOM, no canvas, no Three.js: this is the single source of truth for
 * position, velocity, finish state and history.
 */

(function (root) {
  'use strict';

  class KinematicsModel {
    constructor(options = {}) {
      this.options = Object.assign({
        trackLengthUnits: 100,
        mode: 'single' // 'single' | 'race' | 'opposite' | 'multistage'
      }, options);

      this.robots = [];
      this.elapsedSimTime = 0;
      this.isFinished = false;
      this.history = [];
    }

    /**
     * Configure robots.
     * Each robot: { id, name, color, velocity, startPosUnits, targetUnits,
     *               direction, trackY, stages }
     */
    setRobots(robotConfigs = []) {
      this.robots = robotConfigs.map((cfg, idx) => ({
        id: cfg.id || `robot_${idx}`,
        name: cfg.name || `Robot ${idx + 1}`,
        color: cfg.color || '#4F46E5',
        velocity: cfg.velocity || 0,
        position: cfg.startPosUnits || 0,
        startPos: cfg.startPosUnits || 0,
        target: cfg.targetUnits != null ? cfg.targetUnits : this.options.trackLengthUnits,
        direction: cfg.direction || 1,
        isFinished: false,
        finishTime: null,
        // 2D fallback lane. The 3D renderer uses its own lane index.
        trackY: cfg.trackY || 0.78 + idx * 0.08,
        stages: cfg.stages || null,
        currentStageIdx: 0,
        stageDistTraveled: 0
      }));

      this.reset();
    }

    reset() {
      this.elapsedSimTime = 0;
      this.isFinished = false;
      this.history = [];

      this.robots.forEach((robot) => {
        robot.position = robot.startPos;
        robot.isFinished = false;
        robot.finishTime = null;
        robot.currentStageIdx = 0;
        robot.stageDistTraveled = 0;
      });

      this.recordHistoryPoint();
    }

    /**
     * Advance the simulation by `dt` simulated seconds.
     * Returns true when every robot has finished.
     */
    update(dt) {
      this.elapsedSimTime += dt;
      let allDone = true;

      this.robots.forEach((robot) => {
        if (robot.isFinished) return;

        let currentV = robot.velocity;

        if (robot.stages && robot.stages.length > 0) {
          let timeLeft = dt;
          let guard = 0;
          while (timeLeft > 1e-9 && !robot.isFinished && guard < 1000) {
            const currentStage = robot.stages[robot.currentStageIdx];
            if (!currentStage) {
              robot.isFinished = true;
              robot.finishTime = this.elapsedSimTime - timeLeft;
              break;
            }

            const stageRemaining = currentStage.s - robot.stageDistTraveled;
            if (stageRemaining <= 1e-9) {
              robot.currentStageIdx += 1;
              robot.stageDistTraveled = 0;
              if (robot.currentStageIdx >= robot.stages.length) {
                robot.isFinished = true;
                robot.finishTime = this.elapsedSimTime - timeLeft;
              }
              guard += 1;
              continue;
            }

            if (!(currentStage.v > 0)) break;
            robot.velocity = currentStage.v;
            const stageTimeNeeded = stageRemaining / currentStage.v;
            const timeUsed = Math.min(timeLeft, stageTimeNeeded);
            const travel = currentStage.v * timeUsed;

            robot.position += travel * robot.direction;
            robot.stageDistTraveled += travel;
            timeLeft -= timeUsed;

            if (robot.stageDistTraveled >= currentStage.s - 1e-9) {
              robot.currentStageIdx += 1;
              robot.stageDistTraveled = 0;
              if (robot.currentStageIdx >= robot.stages.length) {
                robot.isFinished = true;
                robot.finishTime = this.elapsedSimTime - timeLeft;
              }
            }
            guard += 1;
          }
        } else {
          const distDelta = currentV * dt;
          robot.position += distDelta * robot.direction;

          if (robot.direction > 0 && robot.position >= robot.target) {
            robot.position = robot.target;
            robot.isFinished = true;
            robot.finishTime = this.elapsedSimTime;
          } else if (robot.direction < 0 && robot.position <= robot.target) {
            robot.position = robot.target;
            robot.isFinished = true;
            robot.finishTime = this.elapsedSimTime;
          }
        }

        if (!robot.isFinished) allDone = false;
      });

      if (this.options.mode === 'opposite' && this.robots.length >= 2) {
        const r1 = this.robots[0];
        const r2 = this.robots[1];
        if (r1.position >= r2.position) {
          const meetingPoint = (r1.position + r2.position) / 2;
          r1.position = meetingPoint;
          r2.position = meetingPoint;
          r1.isFinished = true;
          r2.isFinished = true;
          r1.finishTime = this.elapsedSimTime;
          r2.finishTime = this.elapsedSimTime;
          allDone = true;
        }
      }

      this.isFinished = allDone;
      this.recordHistoryPoint();
      return this.isFinished;
    }

    recordHistoryPoint() {
      const point = {
        t: parseFloat(this.elapsedSimTime.toFixed(2))
      };
      this.robots.forEach((robot, idx) => {
        point[`d${idx}`] = parseFloat(robot.position.toFixed(2));
        point[`v${idx}`] = parseFloat(robot.velocity.toFixed(2));
      });
      this.history.push(point);
      if (this.history.length > 500) this.history.shift();
    }
  }

  root.KinematicsModel = KinematicsModel;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = KinematicsModel;
  }
})(typeof window !== 'undefined' ? window : globalThis);
