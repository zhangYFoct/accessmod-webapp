import { CONFIG } from 'src/global-config';

import { UserView } from 'src/sections/user';

// ----------------------------------------------------------------------

export const metadata = { title: `User Settings | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return <UserView />;
}
