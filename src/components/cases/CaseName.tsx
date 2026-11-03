interface CaseNameProps {
  code: string;
  alias?: string | null;
  className?: string;
}

// Shows the optional alias as the main name and the case code smaller in parentheses.
export default function CaseName({ code, alias, className = "" }: CaseNameProps) {
  if (!alias) {
    return <span className={className}>{code}</span>;
  }

  return (
    <span className={className}>
      {alias} <span className="text-[0.8em] font-medium opacity-60">({code})</span>
    </span>
  );
}
