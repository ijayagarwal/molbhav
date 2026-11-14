// Temporary page body for routes that later phases build. Props only (components/mb rule).
export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col gap-4 px-4 py-10">
      <h1 className="text-[28px] font-bold leading-[36px]">{title}</h1>
      <p className="text-[17px] leading-[27px] text-ink-2">{body}</p>
    </main>
  );
}
