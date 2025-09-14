import {AnalysisLayout}  from 'src/sections/analysis/analysis_layout';

// ----------------------------------------------------------------------

type Props = {
  children: React.ReactNode;
};

export default function Layout({ children }: Props) {
  return <AnalysisLayout> {children}</AnalysisLayout>;
}