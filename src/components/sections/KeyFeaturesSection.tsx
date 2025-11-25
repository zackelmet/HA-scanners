import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRocket,
  faCrosshairs,
  faChartLine,
  faDesktop,
} from "@fortawesome/free-solid-svg-icons";

export default function KeyFeaturesSection() {
  const keyFeatures = [
    {
      icon: faRocket,
      title: "Effortless Deployment & Maintenance",
      description:
        "As a fully hosted service, there is nothing to install or maintain. Launch your comprehensive security scans instantly from anywhere, whenever your operations demand it.",
      badge: "Effortless deployment",
    },
    {
      icon: faCrosshairs,
      title: "Complete Attack Surface Discovery",
      description:
        "Eliminate blind spots. Find forgotten assets and expose poorly maintained endpoints to ensure full network visibility, providing critical, actionable intelligence for both your Red Team testing and Blue Team defense.",
      badge: "Attack surface discovery",
    },
    {
      icon: faChartLine,
      title: "Advanced Vulnerability Management",
      description:
        "Gain continuous oversight of your security posture. Easily schedule industry-leading tools like OpenVAS and Nmap for ongoing vulnerability detection and proactive firewall monitoring.",
      badge: "Vulnerability management",
    },
    {
      icon: faDesktop,
      title: "Intuitive and Simple Interface",
      description:
        "Security testing shouldn't be complicated. Our platform features a streamlined interface that allows you to launch powerful vulnerability scans via a simple, configuration-driven form, delivering results quickly and without the hassle.",
      badge: "Simple interface",
    },
  ];

  return (
    <section className="w-full py-16 lg:py-24 bg-base-200">
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Key Features Driving Annual Renewals
          </h2>
          <p className="text-xl opacity-80 max-w-4xl mx-auto">
            Discover the powerful capabilities that lead Fortune 100 companies,
            large government agencies, and IT professionals worldwide to renew
            their commitment to our platform year after year.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {keyFeatures.map((feature, index) => (
            <div
              key={index}
              className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow"
            >
              <div className="card-body">
                <div className="flex items-start gap-4">
                  <div className="text-primary text-4xl mt-1">
                    <FontAwesomeIcon icon={feature.icon} />
                  </div>
                  <div className="flex-1">
                    <div className="badge badge-primary badge-outline mb-3">
                      {feature.badge}
                    </div>
                    <h3 className="card-title text-xl mb-3">{feature.title}</h3>
                    <p className="opacity-80 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
