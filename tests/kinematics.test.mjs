import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const KinematicsModel = require('../js/kinematics-model.js');

test('uniform motion reaches the target and clamps overshoot', () => {
  const model = new KinematicsModel({ trackLengthUnits: 50, mode: 'single' });
  model.setRobots([{ velocity: 7, targetUnits: 42 }]);

  model.update(10);

  assert.equal(model.robots[0].position, 42);
  assert.equal(model.robots[0].isFinished, true);
  assert.equal(model.isFinished, true);
});

test('history records the initial point and each update', () => {
  const model = new KinematicsModel({ trackLengthUnits: 50 });
  model.setRobots([{ velocity: 7, targetUnits: 42 }]);
  assert.equal(model.history.length, 1);
  assert.equal(model.history[0].t, 0);
  assert.equal(model.history[0].d0, 0);

  model.update(1);
  assert.equal(model.history.length, 2);
  assert.equal(model.history[1].d0, 7);
  assert.equal(model.history[1].v0, 7);
});

test('reset restores position, time and history', () => {
  const model = new KinematicsModel({ trackLengthUnits: 50 });
  model.setRobots([{ velocity: 7, targetUnits: 42 }]);
  model.update(2);
  model.reset();

  assert.equal(model.robots[0].position, 0);
  assert.equal(model.elapsedSimTime, 0);
  assert.equal(model.isFinished, false);
  assert.equal(model.history.length, 1);
  assert.equal(model.robots[0].isFinished, false);
});

test('multi-stage motion clamps at stage boundaries', () => {
  const model = new KinematicsModel({ trackLengthUnits: 100 });
  model.setRobots([{
    velocity: 2,
    targetUnits: 100,
    stages: [
      { s: 10, v: 2 },
      { s: 20, v: 3 },
    ],
  }]);

  model.update(12);

  assert.equal(model.robots[0].position, 30);
  assert.equal(model.robots[0].isFinished, true);
  assert.ok(Math.abs(model.robots[0].finishTime - 35 / 3) < 1e-6);
  assert.equal(model.isFinished, true);
});

test('opposite mode stops both robots at the meeting point', () => {
  const model = new KinematicsModel({ trackLengthUnits: 100, mode: 'opposite' });
  model.setRobots([
    { velocity: 5, startPosUnits: 0, targetUnits: 100, direction: 1 },
    { velocity: 5, startPosUnits: 100, targetUnits: 0, direction: -1 },
  ]);

  model.update(10);

  assert.equal(model.robots[0].position, 50);
  assert.equal(model.robots[1].position, 50);
  assert.equal(model.robots[0].isFinished, true);
  assert.equal(model.robots[1].isFinished, true);
});
