import type { NavSectionProps } from 'src/components/nav-section';

import { paths } from 'src/routes/paths';

import { CONFIG } from 'src/global-config';

import { SvgColor } from 'src/components/svg-color';

import TravelExploreIcon from '@mui/icons-material/TravelExplore';

// ----------------------------------------------------------------------

const icon = (name: string) => (
  <SvgColor src={`${CONFIG.assetsDir}/assets/icons/navbar/${name}.svg`} />
);

const ICONS = {
  job: icon('ic-job'),
  blog: icon('ic-blog'),
  chat: icon('ic-chat'),
  mail: icon('ic-mail'),
  user: icon('ic-user'),
  file: icon('ic-file'),
  lock: icon('ic-lock'),
  tour: icon('ic-tour'),
  order: icon('ic-order'),
  label: icon('ic-label'),
  blank: icon('ic-blank'),
  kanban: icon('ic-kanban'),
  folder: icon('ic-folder'),
  course: icon('ic-course'),
  banking: icon('ic-banking'),
  booking: icon('ic-booking'),
  invoice: icon('ic-invoice'),
  product: icon('ic-product'),
  calendar: icon('ic-calendar'),
  disabled: icon('ic-disabled'),
  external: icon('ic-external'),
  menuItem: icon('ic-menu-item'),
  ecommerce: icon('ic-ecommerce'),
  analytics: icon('ic-analytics'),
  dashboard: icon('ic-dashboard'),
  parameter: icon('ic-parameter'),
};

// ----------------------------------------------------------------------

export const navData: NavSectionProps['data'] = [
  {
    subheader: '',
    items: [
      {
        title: 'Dashboard',
        path: paths.dashboard.root,
        icon: <TravelExploreIcon />,
      },
      { title: 'Analysis', path: paths.dashboard.analysis, icon: ICONS.analytics },
      { title: 'Projects', path: paths.dashboard.project, icon: ICONS.folder },
      {
        title: 'User',
        path: paths.dashboard.user,
        icon: ICONS.user,
      },
    ],
  },
];
