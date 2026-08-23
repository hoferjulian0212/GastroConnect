import { motion, useReducedMotion } from "framer-motion";

interface HeadlineRevealProps {
  text: string;
  className?: string;
  testId?: string;
  as?: "h1" | "h2";
}

export function HeadlineReveal({
  text,
  className,
  testId,
  as = "h1",
}: HeadlineRevealProps) {
  const reduce = useReducedMotion();
  const Tag = as === "h1" ? motion.h1 : motion.h2;
  const words = text.split(" ");
  const accentWords = new Set([
    "händler", "betriebe", "commercianti", "aziende",
    "suppliers", "restaurants", "restaurant", "suppliers.",
    "restaurants.", "commercianti.", "aziende.",
  ]);
  const wordClass = (word: string) =>
    accentWords.has(word.toLocaleLowerCase()) ||
    accentWords.has(word.toLocaleLowerCase().replace(/[.,!?]/g, ""))
      ? "landing-accent-word"
      : undefined;

  if (reduce) {
    return (
      <Tag
        className={className}
        data-testid={testId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {words.map((w, i) => (
          <span key={i} className={`inline-block ${wordClass(w) ?? ""}`} style={{ marginRight: "0.27em" }}>
            {w}
          </span>
        ))}
      </Tag>
    );
  }

  return (
    <Tag
      className={className}
      data-testid={testId}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
      }}
      aria-label={text}
    >
      {words.map((w, i) => (
        <motion.span
          key={i}
            className={`inline-block ${wordClass(w) ?? ""}`}
          style={{ marginRight: "0.27em", willChange: "transform, filter" }}
          variants={{
            hidden: { opacity: 0, y: 12, filter: "blur(8px)" },
            visible: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: {
                type: "spring",
                stiffness: 160,
                damping: 22,
                mass: 0.7,
              },
            },
          }}
          aria-hidden="true"
        >
          {w}
        </motion.span>
      ))}
    </Tag>
  );
}
