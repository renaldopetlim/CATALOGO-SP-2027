import { formatDateTime } from '../../lib/format';

/** Data e hora em duas linhas compactas ("19/11/2026" / "02:53"), com o valor completo no title. */
export function DateCell({ iso }: { iso: string }) {
  const full = formatDateTime(iso);
  const [date, time] = full.split(' ');
  return (
    <time dateTime={iso} title={full}>
      {date}
      {time && <span className="date-time">{time}</span>}
    </time>
  );
}
