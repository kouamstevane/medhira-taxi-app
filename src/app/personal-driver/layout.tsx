import { PersonalDriverPlansProvider } from './PersonalDriverPlansProvider';

export default function PersonalDriverLayout({ children }: { children: React.ReactNode }) {
  return <PersonalDriverPlansProvider>{children}</PersonalDriverPlansProvider>;
}
