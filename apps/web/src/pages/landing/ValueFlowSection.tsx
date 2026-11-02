const VALUE_CARDS = [
  {
    id: "001",
    title: "Configure & publish",
    desc: "Teachers set course types, classes, roster, and the publish window—one place to open a round.",
    tag: "PUBLISH ONCE · RUN THE CLASS",
    icon01: "/aeye/img/69ccce9504d3c22efbc7d98f_value1.1.avif",
    icon02: "/aeye/img/69ccce951aab5d53dd1a31ca_value1.2.png",
  },
  {
    id: "002",
    title: "Ranked preferences",
    desc: "Students save ordered choices before the deadline. Filling does not hold seats; rules stay on the server.",
    tag: "NO SEAT HOLD WHILE FILLING",
    icon01: "/aeye/img/69ccce95672b1cc07b07ed6a_value2.1.avif",
    icon02: "/aeye/img/69ccce952e2d3e82695eeb2b_value2.2.png",
  },
  {
    id: "003",
    title: "Freeze & evidence",
    desc: "After cutoff: snapshot, one primary allocation, teacher summary and evidence—results you can replay in class.",
    tag: "AUDITABLE · NOT A SPREADSHEET",
    icon01: "/aeye/img/69ccce9572646f7dad00deea_value3.1.avif",
    icon02: "/aeye/img/69ccce950b69c3bc83f6bd8e_value3.2.png",
  },
] as const;

export function ValueFlowSection() {
  return (
    <section className="section landing-value-section" id="hiw-flow">
      <div className="padding-global">
        <div className="container-base">
          <div className="value-layout">
            <div className="eyebrow-section">
              <div className="eyebrow-main">
                <div className="eyebrow-text">
                  <div className="eyebrow-text">[n.</div>
                  <div className="eyebrow-text">03</div>
                  <div className="eyebrow-text">/</div>
                  <div className="eyebrow-text total">11</div>
                  <div className="eyebrow-text">]</div>
                </div>
                <div className="eyebrow-line small" />
                <div className="eyebrow-text">&gt; core capabilities</div>
              </div>
              <div className="eyebrow-line" />
            </div>

            <div className="value-main">
              <div className="value-heading">
                <h2 className="heading-style-h3">
                  <span className="heading-slash">/</span>{" "}
                  <span data-scramble="" className="heading-style-h3">
                    More reliable execution.
                  </span>{" "}
                  <span className="heading-slash">/</span>
                </h2>
              </div>

              <div className="value-content">
                {VALUE_CARDS.map((card) => (
                  <div key={card.id} className="value-card">
                    <div className="value-card-content">
                      <div className="value-card-top">
                        <div className="value-card-icon-wrap">
                          <div className="value-card-icon-inner">
                            <img loading="lazy" alt="" className="value-card-icon _01" src={card.icon01} />
                            <img loading="lazy" alt="" className="value-card-icon _02" src={card.icon02} />
                          </div>
                        </div>
                        <div className="value-card-number">
                          <div className="text-splase">//</div>
                          <div>{card.id}</div>
                        </div>
                      </div>
                      <div className="value-card-title-wrap">
                        <div className="value-card-title">{card.title}</div>
                        <p className="value-card-description">{card.desc}</p>
                      </div>
                    </div>
                    <div className="value-card-tag">{card.tag}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
