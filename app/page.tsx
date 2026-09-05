import Link from "next/link";

export default function HomePage() {
  return (
    <main className="hero">
      <div className="hero__content">
        <p className="hero__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </p>
        <h1>A task board that remembers every change.</h1>
        <p className="hero__sub">
          Move a card, reassign an owner, or leave a comment — scrummy keeps the full history on
          every task, so you can always see how the work got done.
        </p>
        <div className="hero__cta">
          <Link className="button" href="/signup">
            Create an account
          </Link>
          <Link className="button button--secondary" href="/login">
            Log in
          </Link>
        </div>
      </div>

      <div className="hero__panel" aria-hidden="true">
        <div className="hero__panel-cols">
          <div className="hero__col">
            <h4>To do</h4>
            <div className="hero__chip hero__chip--high">Fix timezone bug</div>
            <div className="hero__chip">Write release notes</div>
          </div>
          <div className="hero__col">
            <h4>In progress</h4>
            <div className="hero__chip hero__chip--progress">Board filters</div>
          </div>
          <div className="hero__col">
            <h4>Done</h4>
            <div className="hero__chip">Auth flow</div>
          </div>
        </div>
        <div className="hero__trail">
          <div className="hero__trail-row">
            Priya moved this to In progress <span>2h ago</span>
          </div>
          <div className="hero__trail-row">
            Priya reassigned to Dev <span>1h ago</span>
          </div>
          <div className="hero__trail-row">
            Dev commented &ldquo;Filters live on staging&rdquo; <span>12m ago</span>
          </div>
        </div>
      </div>
    </main>
  );
}
