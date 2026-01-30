export default function Loading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-6">
        <p className="text-lg font-bold text-slate-900 sm:text-xl">男磨きAI</p>
        <span
          className="h-8 w-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"
          aria-label="読み込み中"
        />
      </div>
    </div>
  );
}
