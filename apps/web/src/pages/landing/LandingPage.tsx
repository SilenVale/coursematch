import { useCallback, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AeyeBrand } from "./AeyeBrand";
import { AeyeGlobalStyles } from "./aeyeGlobalStyles";
import { PixelGrid, PreloadGrid } from "./aeyeGrids";
import { useAeyeLandingScripts } from "./useAeyeLandingScripts";
import { ValueFlowSection } from "./ValueFlowSection";

const PARTNER_LOGOS = [
  "/aeye/img/69cb83de434748cd132c892d_logopartner.svg",
  "/aeye/img/69cb83de13a3208113f3d10b_logopartner-1.svg",
  "/aeye/img/69cb83debe6c4b00130f7748_logopartner-2.svg",
  "/aeye/img/69cb83def74f8c2cf07a8be3_logopartner-3.svg",
  "/aeye/img/69cb83dedd95ccb21d1c1543_logopartner-4.svg",
] as const;

function ButtonIconPlus() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3.33594 9.16504V10.8317H13.3359V12.4984H15.0026V10.8317H16.6693V9.16504H15.0026V7.49837H13.3359V9.16504H3.33594ZM11.6693 5.83171H13.3359V7.49837H11.6693V5.83171ZM11.6693 5.83171H10.0026V4.16504L11.6693 4.16504V5.83171ZM11.6693 14.165H13.3359V12.4984H11.6693V14.165ZM11.6693 14.165H10.0026V15.8317H11.6693V14.165Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useAeyeLandingScripts(true);

  const goLogin = useCallback(() => navigate("/login"), [navigate]);
  const scrollToFlow = useCallback(() => {
    document.getElementById("hiw-flow")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    document.title = "CourseMatch";
    const html = document.documentElement;
    const prevHtml = html.className;
    html.classList.add("w-mod-js", "w-mod-ix");
    document.body.classList.add("landing-body");
    return () => {
      html.className = prevHtml;
      document.body.classList.remove("landing-body");
    };
  }, []);

  useEffect(() => {
    const prefill = searchParams.get("prefill");
    if (prefill) {
      navigate(`/login?prefill=${encodeURIComponent(prefill)}`, { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="landing-page">
        <div className="page-wrapper">
          <AeyeGlobalStyles />

          <div className="nav_fixed">
            <div role="banner" className="navbar w-nav">
              <div className="navbar-container">
                <Link to="/" aria-current="page" className="navbar-brand-link w-nav-brand w--current">
                  <AeyeBrand />
                </Link>
                <nav role="navigation" className="nav-menu w-nav-menu">
                  <div className="nav-menu-wrap">
                    <Link to="/" data-scramble-hover="" className="navlink w-inline-block w--current">
                      <div className="navlink-text">
                        <div className="navlink-brackets">&lt;</div>
                        <div data-scramble-hover-text="">Home</div>
                        <div className="navlink-brackets">&gt;</div>
                      </div>
                    </Link>
                    <button
                      type="button"
                      data-scramble-hover=""
                      className="navlink w-inline-block landing-nav-btn"
                      onClick={scrollToFlow}
                    >
                      <div className="navlink-text">
                        <div data-scramble-hover-text="">Flow</div>
                      </div>
                    </button>
                  </div>
                </nav>
                <div className="nav-button-wrapper">
                  <button type="button" data-scramble-hover="" className="button-nav w-inline-block landing-nav-btn" onClick={goLogin}>
                    <div className="btn-arrow-icon">
                      <div className="arrow-icon w-embed">
                        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 20 20" fill="none" aria-hidden>
                          <path
                            d="M4 10H16M16 10L11 5M16 10L11 15"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                    <div data-scramble-hover-text="">Login</div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <PreloadGrid />

          <main className="main-wrapper">
            <section className="section hero">
              <div className="hero-header">
                <div className="hero-top-content">
                  <div className="padding-global">
                    <div className="container-base">
                      <div className="hero-top-content-layout">
                        <AeyeBrand />
                        <div className="hero-top-scroll">
                          <div>SCROLL FOR MORE</div>
                          <div className="hero-top-scroll-icon w-embed">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 16 16" fill="none" aria-hidden>
                              <path d="M8 3V13M8 13L4 9M8 13L12 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <PixelGrid />
                    </div>
                  </div>
                </div>
              </div>

              <div className="hero-layout">
                <div className="padding-global">
                  <div className="container-base">
                    <div className="hero-top" aria-hidden />
                    <div className="hero-heading-wrap">
                      <h1 className="hero-heading heading">
                        A course-built
                        <br />
                        <span className="hero-heading-highlight">[ </span>
                        <span
                          data-delay="2000"
                          data-typewriter=""
                          data-words="Course Selection,Primary Allocation,Audit Trail"
                          data-scramble="skip"
                          className="hero-heading-highlight"
                        >
                          Course Selection
                        </span>
                        <span className="hero-heading-highlight"> ]</span>
                        <br />
                        system you can audit.
                        <br />
                      </h1>
                    </div>
                    <div className="hero-content-wrap">
                      <div className="hero-content-top">
                        <div className="hero-ratting-wrap">
                          <div className="hero-ratting-image-wrap">
                            <img loading="lazy" alt="" className="hero-ratting-image" src="/aeye/img/trusted-0.avif" />
                            <img loading="lazy" alt="" className="hero-ratting-image" src="/aeye/img/trusted-1.avif" />
                            <img loading="lazy" alt="" className="hero-ratting-image" src="/aeye/img/trusted-2.avif" />
                          </div>
                          <div className="hero-ratting-content">
                            <div className="hero-ratting-text">
                              Built for{" "}
                              <span className="hero-ratting-hightlight">SE coursework</span> · Teacher &amp; Student
                            </div>
                            <div className="hero-ratting-star">
                              <div className="hero-ratting-icon w-embed">
                                <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 16 16" fill="none" aria-hidden>
                                  <path
                                    d="M8 0L10.3511 4.76393L15.6085 5.52786L11.8042 9.23607L12.7023 14.4721L8 12L3.29772 14.4721L4.19577 9.23607L0.391548 5.52786L5.64886 4.76393L8 0Z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </div>
                              <div className="hero-ratting-text">
                                <span className="hero-ratting-hightlight">Auditable</span> / V1
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="hero-content-desc">
                        &ldquo;Publish the roster, let students rank preferences before cutoff, then freeze and run
                        one primary allocation—with a snapshot and evidence we can replay in class, not a black-box
                        spreadsheet.&rdquo;
                      </p>
                      <div className="hero-content-bottom">
                        <button type="button" className="button w-inline-block landing-nav-btn" onClick={goLogin}>
                          <div className="button-dot" />
                          <div className="button-text-wrap">
                            <div data-scramble-hover-text="" className="button-text">
                              Get Started
                            </div>
                            <div className="button-icon w-embed">
                              <ButtonIconPlus />
                            </div>
                          </div>
                          <div className="button-bg-hover" />
                        </button>
                        <button type="button" className="button-line w-inline-block landing-nav-btn" onClick={scrollToFlow}>
                          <div className="btn-play-icon w-embed">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M9 5H11V7H9V17H11V19H9V21H7V3H9V5ZM13 17H11V15H13V17ZM15 15H13V13H15V15ZM17 13H15V11H17V13ZM15 11H13V9H15V11ZM13 9H11V7H13V9Z"
                                fill="currentColor"
                              />
                            </svg>
                          </div>
                          <div className="btn-chervon-icon w-embed">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 20 20" fill="none" aria-hidden>
                              <path
                                d="M6.66406 4.16602V5.83268H8.33073V4.16602H6.66406ZM9.9974 7.49935V5.83268H8.33073V7.49935H9.9974ZM11.6641 9.16602V7.49935H9.9974V9.16602H11.6641ZM11.6641 10.8327H13.3307V9.16602H11.6641V10.8327ZM9.9974 12.4993V10.8327H11.6641V12.4993H9.9974ZM9.9974 12.4993H8.33073V14.166H9.9974V12.4993ZM6.66406 15.8327V14.166H8.33073V15.8327H6.66406Z"
                                fill="currentColor"
                              />
                            </svg>
                          </div>
                          <div className="button-link-text-wrap">
                            <div data-scramble-hover-text="" className="button-link-text">
                              watch demo
                            </div>
                          </div>
                          <div className="button-link-text-wrap _02">
                            <div data-scramble-hover-text="" className="button-link-text">
                              watch demo
                            </div>
                          </div>
                          <div className="button-demo-hover-line" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hero-main padding-global">
                <div className="container-base">
                  <div className="partner-logo-marquee">
                    <div className="partner-logo-wrap">
                      {[...PARTNER_LOGOS, ...PARTNER_LOGOS].map((src, i) => (
                        <div key={`${src}-${i}`} className="partner-logo">
                          <img loading="lazy" alt="" className="partner-logo-image" src={src} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <ValueFlowSection />
          </main>

          <footer className="footer">
            <div className="padding-global">
              <div className="container-base">
                <div className="footer-bottom">
                  <div className="footer-bottom-text">© CourseMatch · Software Engineering</div>
                  <div className="footer-bottom-link-wrap">
                    <span className="footer-bottom-link">React · Fastify · PostgreSQL</span>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>
  );
}
