import { MotionRoot } from "@/components/mb/MotionRoot";
import { ShellDemo } from "@/features/styleguide/ShellDemo";
import { getDict } from "@/lib/i18n/getDict";
import { getServerDict } from "@/lib/i18n/server";

// Phase 2B: the phone shell and the Munshi desk with fixture data (sim, fake recorder, no server).
export default async function ShellPage() {
  const { lang } = await getServerDict();
  return (
    <MotionRoot>
      <ShellDemo dict={getDict(lang)} lang={lang} />
    </MotionRoot>
  );
}
