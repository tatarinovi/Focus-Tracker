import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
        <h1 className="text-2xl font-bold text-foreground">404 — Страница не найдена</h1>
        <p className="text-sm text-muted-foreground">
          Запрошенная страница не существует.
        </p>
        <Link href="/" className="inline-block text-sm text-primary hover:underline">
          Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
