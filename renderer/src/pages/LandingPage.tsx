import {
  Timer,
  Circle,
  LayoutGrid,
  Calendar,
  Ticket,
  FileText,
  Coffee,
  Clock,
  Download,
  Github,
  ExternalLink,
  Check,
} from "lucide-react";
import {
  FEATURES,
  TECH_STACK,
  CHANGELOG,
  SCREENSHOTS,
  GITHUB_URL,
  RELEASES_URL,
  DESCRIPTION,
  LICENSE,
  CURRENT_VERSION,
  detectPlatform,
  getDownloadUrl,
  PLATFORM_LABELS,
  type Platform,
} from "@/content/site";
import { useEffect, useState } from "react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Timer,
  Circle,
  LayoutGrid,
  Calendar,
  Ticket,
  FileText,
  Coffee,
  Clock,
};

function Hero() {
  const [platform, setPlatform] = useState<Platform>("unknown");

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const downloadUrl = getDownloadUrl(platform);
  const platformLabel = PLATFORM_LABELS[platform];

  return (
    <section className="relative overflow-hidden py-20 lg:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-[#5b7cfa]/5 to-transparent pointer-events-none" />
      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#5b7cfa]/20 bg-[#5b7cfa]/5 px-4 py-1.5 text-sm text-[#5b7cfa]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5b7cfa] animate-pulse" />
          v{CURRENT_VERSION} — Stable
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
          Focus{" "}
          <span className="bg-gradient-to-r from-[#5b7cfa] to-[#a78bfa] bg-clip-text text-transparent">
            Tracker
          </span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-400 mb-10 leading-relaxed">
          {DESCRIPTION}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-2 rounded-xl bg-[#5b7cfa] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5b7cfa]/25 transition-all hover:bg-[#4a6be0] hover:shadow-[#5b7cfa]/40"
          >
            <Download className="h-4 w-4" />
            {platformLabel
              ? `Download for ${platformLabel}`
              : "Download Focus Tracker"}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-700 px-6 py-3 text-sm font-semibold text-gray-300 transition-all hover:border-gray-500 hover:text-white"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
        <div className="relative mx-auto max-w-4xl rounded-2xl border border-gray-800 overflow-hidden shadow-2xl shadow-black/50">
          <img
            src="./opengraph.png"
            alt="Focus Tracker — интерфейс приложения"
            className="w-full h-auto"
            loading="eager"
          />
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Возможности
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Всё необходимое для персонального тайм-трекинга и управления задачами
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feature) => {
            const Icon = ICON_MAP[feature.icon] || Circle;
            return (
              <div
                key={feature.title}
                className="group rounded-xl border border-gray-800 bg-[#15171e] p-5 transition-all hover:border-[#5b7cfa]/30 hover:bg-[#181b24]"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#5b7cfa]/10 text-[#5b7cfa] group-hover:bg-[#5b7cfa]/15">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5">
                  {feature.title}
                </h3>
                <p className="text-xs leading-relaxed text-gray-500">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Gallery() {
  const [current, setCurrent] = useState(0);

  const prev = () => setCurrent((i) => (i === 0 ? SCREENSHOTS.length - 1 : i - 1));
  const next = () => setCurrent((i) => (i === SCREENSHOTS.length - 1 ? 0 : i + 1));

  return (
    <section className="py-20 lg:py-28 border-t border-gray-800/50">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Интерфейс
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Как выглядит Focus Tracker
          </p>
        </div>
        <div className="relative group">
          <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#15171e]">
            <img
              src={SCREENSHOTS[current].src}
              alt={SCREENSHOTS[current].alt}
              className="w-full h-auto transition-opacity duration-300"
            />
          </div>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 border border-gray-700 text-gray-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 hover:text-white"
          >
            ‹
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 border border-gray-700 text-gray-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 hover:text-white"
          >
            ›
          </button>
          <p className="text-center text-sm text-gray-500 mt-4">
            {SCREENSHOTS[current].caption}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            {SCREENSHOTS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`h-2 rounded-full transition-all ${
                  i === current
                    ? "w-6 bg-[#5b7cfa]"
                    : "w-2 bg-gray-600 hover:bg-gray-500"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TechStack() {
  return (
    <section className="py-20 lg:py-28 border-t border-gray-800/50">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Технологии
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Построено на современном стеке для быстрой и надёжной работы
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {TECH_STACK.map((tech) => (
            <div
              key={tech.name}
              className="flex flex-col items-center justify-center rounded-xl border border-gray-800 bg-[#15171e] p-5 text-center transition-all hover:border-gray-700"
            >
              <span className="text-sm font-semibold text-white mb-0.5">
                {tech.name}
              </span>
              <span className="text-xs text-gray-500">{tech.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DownloadSection() {
  const [platform, setPlatform] = useState<Platform>("unknown");

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const platforms: { key: Platform; label: string; ext: string }[] = [
    { key: "windows", label: "Windows", ext: ".exe" },
    { key: "macos", label: "macOS", ext: ".dmg" },
    { key: "linux", label: "Linux", ext: ".AppImage" },
  ];

  return (
    <section className="py-20 lg:py-28 border-t border-gray-800/50">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Скачать
        </h2>
        <p className="text-gray-400 max-w-xl mx-auto mb-10">
          Доступно для Windows, macOS и Linux
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <a
            href={getDownloadUrl(platform)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#5b7cfa] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#5b7cfa]/25 transition-all hover:bg-[#4a6be0] hover:shadow-[#5b7cfa]/40"
          >
            <Download className="h-4 w-4" />
            {platform !== "unknown"
              ? `Скачать для ${PLATFORM_LABELS[platform]}`
              : "Скачать Focus Tracker"}
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
          {platforms
            .filter((p) => p.key !== platform)
            .map((p) => (
              <a
                key={p.key}
                href={getDownloadUrl(p.key)}
                className="inline-flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-300"
              >
                <Check className="h-3 w-3" />
                {p.label}
                <span className="text-gray-600">{p.ext}</span>
              </a>
            ))}
        </div>
        <div className="mt-6">
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-400"
          >
            Все релизы
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Changelog() {
  return (
    <section className="py-20 lg:py-28 border-t border-gray-800/50">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            История изменений
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Что нового в каждом релизе
          </p>
        </div>
        <div className="space-y-8">
          {CHANGELOG.map((release) => (
            <div
              key={release.version}
              className="rounded-xl border border-gray-800 bg-[#15171e] p-6"
            >
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-lg font-semibold text-white">
                  v{release.version}
                </span>
                <span className="text-sm text-gray-500">{release.date}</span>
              </div>
              <ul className="space-y-2">
                {release.changes.map((change, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-400"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5b7cfa]/60" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-800/50 py-10">
      <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-xs text-gray-600">
          Focus Tracker &middot; {LICENSE}
        </span>
        <div className="flex items-center gap-6">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 transition-colors hover:text-gray-300"
          >
            GitHub
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 transition-colors hover:text-gray-300"
          >
            Releases
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <Hero />
      <Features />
      <Gallery />
      <TechStack />
      <DownloadSection />
      <Changelog />
      <Footer />
    </div>
  );
}
