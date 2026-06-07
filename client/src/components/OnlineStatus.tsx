import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";

type TFn = (section: any, key: any) => string;

function formatLastSeen(lastSeenAt: string | null, t: TFn): { text: string; isOnline: boolean } {
  if (!lastSeenAt) return { text: t("inbox", "offline"), isOnline: false };

  const now = Date.now();
  const seen = new Date(lastSeenAt).getTime();
  const diffMs = now - seen;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 2) return { text: t("inbox", "online"), isOnline: true };
  if (diffMin < 60) return { text: `${t("inbox", "lastSeen")} ${diffMin} min`, isOnline: false };

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return { text: `${t("inbox", "lastSeen")} ${diffHours}h`, isOnline: false };

  const date = new Date(lastSeenAt);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return { text: `${t("inbox", "lastSeen")} ${day}.${month}`, isOnline: false };
}

export default function OnlineStatus({ userId, size = "md" }: { userId: string; size?: "sm" | "md" }) {
  const { lang } = useLanguage();
  const t = useT(lang);

  const { data } = useQuery<{ lastSeenAt: string | null }>({
    queryKey: ["/api/users", userId, "status"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/status`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { text, isOnline } = formatLastSeen(data?.lastSeenAt ?? null, t);

  return (
    <span className={`flex items-center gap-1 ${size === "sm" ? "text-[10px]" : "text-xs"}`} data-testid={`status-online-${userId}`}>
      <span className={`inline-block rounded-full shrink-0 ${isOnline ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"} ${size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"}`} />
      <span className={isOnline ? "text-green-600 dark:text-green-400 font-medium" : "text-muted-foreground"}>
        {text}
      </span>
    </span>
  );
}
