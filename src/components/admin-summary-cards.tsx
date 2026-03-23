import type { AdminSummary } from "@/components/admin-types";
import {
  Ticket01Icon,
  Users01Icon,
} from "@untitledui/icons-react/outline";

export function AdminSummaryCards({ summary }: { summary: AdminSummary }) {
  const cards = [
    { label: "Usuarios", value: summary.totalUsers, Icon: Users01Icon },
    { label: "Unidades", value: summary.totalUnits, Icon: Ticket01Icon },
  ];

  return (
    <section className="cards admin-cards">
      {cards.map(({ Icon, ...card }) => (
        <article key={card.label} className="card stat admin-stat-card">
          <div className="stat-row">
            <span>{card.label}</span>
            <Icon width={18} height={18} />
          </div>
          <strong>{card.value}</strong>
        </article>
      ))}
    </section>
  );
}
