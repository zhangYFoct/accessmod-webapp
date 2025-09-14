import { CONFIG } from 'src/global-config';

import { ProjectsView } from 'src/sections/projects';

// ----------------------------------------------------------------------

export const metadata = { title: `Projects | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return <ProjectsView />;
}
