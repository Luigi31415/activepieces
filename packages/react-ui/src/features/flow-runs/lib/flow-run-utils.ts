import {
  Check,
  CircleCheck,
  CircleX,
  PauseCircleIcon,
  PauseIcon,
  Timer,
  X,
} from 'lucide-react';

import {
  Action,
  ActionType,
  flowHelper,
  FlowRun,
  FlowRunStatus,
  FlowVersion,
  isNil,
  LoopOnItemsAction,
  LoopStepOutput,
  LoopStepResult,
  StepOutput,
  StepOutputStatus,
  Trigger,
} from '@activepieces/shared';

export const flowRunUtils = {
  findFailedStep,
  findLoopsState,
  extractStepOutput,
  getStatusIconForStep(stepOutput: StepOutputStatus): {
    variant: 'default' | 'success' | 'error';
    Icon:
      | typeof Timer
      | typeof CircleCheck
      | typeof PauseCircleIcon
      | typeof CircleX;
  } {
    switch (stepOutput) {
      case StepOutputStatus.RUNNING:
        return {
          variant: 'default',
          Icon: Timer,
        };
      case StepOutputStatus.PAUSED:
        return {
          variant: 'default',
          Icon: PauseCircleIcon,
        };
      case StepOutputStatus.STOPPED:
      case StepOutputStatus.SUCCEEDED:
        return {
          variant: 'success',
          Icon: CircleCheck,
        };
      case StepOutputStatus.FAILED:
        return {
          variant: 'error',
          Icon: CircleX,
        };
    }
  },
  getStatusIcon(status: FlowRunStatus): {
    variant: 'default' | 'success' | 'error';
    Icon: typeof Timer | typeof Check | typeof PauseIcon | typeof X;
  } {
    switch (status) {
      case FlowRunStatus.RUNNING:
        return {
          variant: 'default',
          Icon: Timer,
        };
      case FlowRunStatus.SUCCEEDED:
        return {
          variant: 'success',
          Icon: Check,
        };
      case FlowRunStatus.STOPPED:
        return {
          variant: 'success',
          Icon: Check,
        };
      case FlowRunStatus.FAILED:
        return {
          variant: 'error',
          Icon: X,
        };
      case FlowRunStatus.PAUSED:
        return {
          variant: 'default',
          Icon: PauseIcon,
        };
      case FlowRunStatus.QUOTA_EXCEEDED:
        return {
          variant: 'error',
          Icon: X,
        };
      case FlowRunStatus.INTERNAL_ERROR:
        return {
          variant: 'error',
          Icon: X,
        };
      case FlowRunStatus.TIMEOUT:
        return {
          variant: 'error',
          Icon: X,
        };
    }
  },
};

const findFailedStepInLoop: (
  loopStepResult: LoopStepResult,
) => string | null = (loopStepResult) => {
  return loopStepResult.iterations.reduce((res, iteration) => {
    const failedStepWithinLoop = Object.entries(iteration).reduce(
      (res, [stepName, step]) => {
        if (step.status === StepOutputStatus.FAILED) {
          return stepName;
        }
        if (
          step.type === ActionType.LOOP_ON_ITEMS &&
          step.output &&
          isNil(res)
        ) {
          return findFailedStepInLoop(step.output);
        }
        return res;
      },
      null as null | string,
    );
    return res ?? failedStepWithinLoop;
  }, null as null | string);
};

function findLoopsState(
  flowVersion: FlowVersion,
  run: FlowRun,
  currentLoopsState: Record<string, number>,
) {
  const loops = flowHelper
    .getAllSteps(flowVersion.trigger)
    .filter((s) => s.type === ActionType.LOOP_ON_ITEMS);
  const failedStep = run.steps ? findFailedStep(run) : null;
  const res = loops.reduce((res, step) => {
    const isFailedStepParent =
      failedStep && flowHelper.isChildOf(step, failedStep);
    return {
      ...res,
      [step.name]: isFailedStepParent
        ? Number.MAX_SAFE_INTEGER
        : currentLoopsState[step.name] ?? 0,
    };
  }, currentLoopsState);

  return res;
}

function findFailedStep(run: FlowRun) {
  return Object.entries(run.steps).reduce((res, [stepName, step]) => {
    if (step.status === StepOutputStatus.FAILED) {
      return stepName;
    }
    if (step.type === ActionType.LOOP_ON_ITEMS && step.output && isNil(res)) {
      return findFailedStepInLoop(step.output);
    }
    return res;
  }, null as null | string);
}


function getLoopChildStepOutput(
  parents: LoopOnItemsAction[],
  loopIndexes: Record<string, number>,
  childName: string,
  runOutput: Record<string, StepOutput>,
): StepOutput | undefined {
  if (parents.length === 0) {
    return undefined;
  }
  let childOutput: LoopStepOutput | undefined = runOutput[parents[0].name] as
    | LoopStepOutput
    | undefined;

  let index = 0;
  while (index < parents.length) {
    const currentParentName = parents[index].name;
    if (
      childOutput &&
      childOutput.output &&
      childOutput.output.iterations[loopIndexes[currentParentName]]
    ) {
      const stepName =
        index + 1 < parents.length ? parents[index + 1].name : childName;
      childOutput = childOutput.output.iterations[
        loopIndexes[parents[index].name]
      ][stepName] as LoopStepOutput | undefined;
    }
    index++;
  }
  return childOutput;
}
function extractStepOutput(
  stepName: string,
  loopIndexes: Record<string, number>,
  output: Record<string, StepOutput>,
  trigger: Trigger,
): StepOutput | undefined {
  const stepOutput = output[stepName];
  if (stepOutput) {
    return stepOutput;
  }
  const parents = flowHelper.findPathToStep({
    trigger: trigger,
    targetStepName: stepName,
  });
  if (parents) {
    return getLoopChildStepOutput(
      parents.filter((p) => p.type === ActionType.LOOP_ON_ITEMS),
      loopIndexes,
      stepName,
      output,
    );
  }
  return undefined;
}
