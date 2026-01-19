import Timer from "../components/timer/Timer";
import { getFeatureById } from "../../lib/features";
import styled from "styled-components";

const feature = getFeatureById("timer");

export const metadata = {
  title: feature?.title || "計時器",
  description: feature?.desc || "番茄鐘 / 倒數提醒",
};

export default function TimerPage() {
  return (
    <FeatureWrapper>
      <FeatureBodyShell>
        <Timer />
      </FeatureBodyShell>
    </FeatureWrapper>
  );
}

// JJ
const FeatureWrapper = styled.div`
  position: relative;
  z-index: 1;
  /* max-width: 1220px; */
  /* margin: 0 auto; */
  /* width: 100%; */

  /* border: 1px solid blue; */
`;

const FeatureBodyShell = styled.div`
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
`;
