import circleUserFilled from '@wearables-ui-toolkit/icons/svg/circleuser__filled.svg';
import users2Filled from '@wearables-ui-toolkit/icons/svg/users2__filled.svg';
import {IconImage} from '@wearables-ui-toolkit/mrbd';
import type {ReactNode} from 'react';
import {initials} from '../format';

/** Avatar content when there is no picture: initials, or an icon for a group or an unknown account. */
export function avatarFallback(name: string | null | undefined, group = false): ReactNode {
  if (group) {
    return <IconImage source={users2Filled} />;
  }
  const letters = name ? initials(name) : '';
  return letters || <IconImage source={circleUserFilled} />;
}
