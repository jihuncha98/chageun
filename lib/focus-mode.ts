import {activeEntry,type Study} from './study';

/** The view is derived from the saved timer, not a transient click state. */
export function shouldShowFocusMode(
  study:Study,
  {ready,review,remoteConflict}:{ready:boolean;review:boolean;remoteConflict:boolean},
):boolean {
  const running=activeEntry(study);
  // Allow the existing conflict-recovery screen to remain accessible.
  return ready&&!review&&!remoteConflict&&running?.kind==='study';
}
