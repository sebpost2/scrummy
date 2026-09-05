export default function Skeleton({
  w,
  h = "1em",
  radius = "4px",
}: {
  w?: string;
  h?: string;
  radius?: string;
}) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: radius }} aria-hidden="true" />;
}
