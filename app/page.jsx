import Link from "next/link";
import { features } from "../lib/features";
import styled, { css } from "styled-components";

export default function HomePage() {
  return (
    <CardsScreen>
      <Header>
        <Subtitle>您的應用程式</Subtitle>
      </Header>
      <CardsGrid>
        {features.map((feature) =>
          feature.available ? (
            <FeatureCardLink
              key={feature.id}
              href={`/${feature.id}`}
              style={{ color: feature.accent }}
            >
              <FeatureIcon style={{ color: feature.accent }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {feature.iconPaths.map((d, idx) => (
                    <path key={idx} d={d} />
                  ))}
                </svg>
              </FeatureIcon>
              <FeatureBody>
                <FeatureTitle>{feature.title}</FeatureTitle>
                <FeatureDesc>{feature.desc}</FeatureDesc>
              </FeatureBody>
              <Glow />
            </FeatureCardLink>
          ) : (
            <FeatureCardDisabled
              key={feature.id}
              style={{ color: feature.accent }}
              aria-disabled="true"
            >
              <FeatureIcon style={{ color: feature.accent }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {feature.iconPaths.map((d, idx) => (
                    <path key={idx} d={d} />
                  ))}
                </svg>
              </FeatureIcon>
              <FeatureBody>
                <FeatureTitle>{feature.title}</FeatureTitle>
                <FeatureDesc>{feature.desc}</FeatureDesc>
                <FeatureCta>即將推出</FeatureCta>
              </FeatureBody>
              <Glow />
            </FeatureCardDisabled>
          ),
        )}
      </CardsGrid>
    </CardsScreen>
  );
}

const CardsScreen = styled.main`
  position: relative;
  z-index: 1;
  padding: 74px 40px 80px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;

  @media (max-width: 720px) {
    padding: 74px 40px 60px;
  }
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #e7e5e4;
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #e7e5e4;
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  width: 100%;
`;

const Glow = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 90%, rgba(255, 255, 255, 0.07), transparent 40%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
`;

const featureCardBase = css`
  all: unset;
  cursor: pointer;
  background: #252322;
  border: 1px solid #2b2826;
  border-radius: 26px;
  padding: 28px 0 0;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;
  align-items: center;
  position: relative;
  overflow: hidden;
  border-color: #36312f;
  transition: all 0.2s ease;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -2px rgba(0, 0, 0, 0.1);

  &:hover {
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-5px) scale(1.04);
    box-shadow:
      0 10px 15px -3px rgba(16, 185, 129, 0.1),
      0 4px 6px -4px rgba(16, 185, 129, 0.1);
  }

  @media (max-width: 720px) {
    min-height: 170px;
  }
`;

const FeatureCardLink = styled(Link)`
  ${featureCardBase}

  &:hover ${Glow} {
    opacity: 1;
  }
`;

const FeatureCardDisabled = styled.div`
  ${featureCardBase}
  cursor: not-allowed;
  opacity: 0.55;

  &:hover ${Glow} {
    opacity: 1;
  }
`;

const FeatureIcon = styled.div`
  width: 70px;
  height: 70px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  font-size: 30px;
  background: #252322;
`;

const FeatureBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;

const FeatureTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #f8fafc;
`;

const FeatureDesc = styled.p`
  margin: 4px 0 10px;
  color: #cbd5e1;
`;

const FeatureCta = styled.span`
  color: #38bdf8;
  font-weight: 700;
`;
