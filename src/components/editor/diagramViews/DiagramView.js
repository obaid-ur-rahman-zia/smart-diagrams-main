// // components/editor/DiagramView.js
// "use client";

// import React from "react";
// import dynamic from "next/dynamic";
// import { useStore } from "@/store";

// const FlowchartView = dynamic(() => import("./View"), { ssr: false });
// const ERDiagramView = dynamic(() => import("./ERDiagramView"), { ssr: false });
// const ArchitectureView = dynamic(() => import("./ArchitectureView"), { ssr: false });
// const SequenceDiagramView = dynamic(() => import("./SequenceDiagramView"), { ssr: false });
// const BlockDiagramView = dynamic(() => import("./BlockDiagramView"), { ssr: false });
// const RequirementDiagramView = dynamic(() => import("./RequirementDiagramView"), { ssr: false });
// const UserJourneyChartView = dynamic(() => import("./UserJourneyChartView"), { ssr: false });

// const DiagramView = ({ color, fontSizes }) => {
//   const code = useStore.use.code();
  
//   // Detect diagram type from code - match with your component names
//   const detectDiagramType = (codeText) => {
//     console.log("Detecting diagram type from code:", codeText?.substring(0, 50));
//     if (!codeText) return 'flowchart';
    
//     const trimmed = codeText.trim().toLowerCase();
    
//     if (trimmed.startsWith('erdiagram')) return 'erDiagram';
//     if (trimmed.startsWith('architecture-beta')) return 'architecture';
//     if (trimmed.startsWith('sequencediagram')) return 'sequenceDiagram';
//     if (trimmed.startsWith('block-beta')) return 'blockDiagram';
//     if (trimmed.startsWith('requirementdiagram')) return 'requirement';
//     if (trimmed.startsWith('journey')) return 'journey';
//     if (trimmed.startsWith('graph') || trimmed.startsWith('flowchart')) return 'flowchart';
    
//     return 'flowchart'; // default
//   };

//   const diagramType = detectDiagramType(code);

//   console.log("Detected diagram type:", diagramType, "from code:", code?.substring(0, 50));

//   // Render the appropriate diagram view
//   switch (diagramType) {
//     case 'erDiagram':
//       return <ERDiagramView color={color} fontSizes={fontSizes} />;
//     case 'architecture':
//       return <ArchitectureView color={color} fontSizes={fontSizes} />;
//     case 'sequenceDiagram':
//       return <SequenceDiagramView color={color} fontSizes={fontSizes} />;
//     case 'blockDiagram':
//       return <BlockDiagramView color={color} fontSizes={fontSizes} />;
//     case 'requirement':
//       return <RequirementDiagramView color={color} fontSizes={fontSizes} />;
//     case 'journey':
//       return <UserJourneyChartView color={color} fontSizes={fontSizes} />;
//     case 'flowchart':
//     default:
//       return <FlowchartView color={color} fontSizes={fontSizes} />;
//   }
// };

// export default DiagramView;
"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useStore } from "@/store";
import { Box, CircularProgress, Typography } from "@mui/material";

const FlowchartView = dynamic(() => import("./View"), { ssr: false });
const ERDiagramView = dynamic(() => import("./ERDiagramView"), { ssr: false });
const ArchitectureView = dynamic(() => import("./ArchitectureView"), { ssr: false });
const SequenceDiagramView = dynamic(() => import("./SequenceDiagramView"), { ssr: false });
const BlockDiagramView = dynamic(() => import("./BlockDiagramView"), { ssr: false });
const RequirementDiagramView = dynamic(() => import("./RequirementDiagramView"), { ssr: false });
const UserJourneyChartView = dynamic(() => import("./UserJourneyChartView"), { ssr: false });

const DiagramView = ({ color, fontSizes }) => {
  const code = useStore((state) => state.code);

  // Show loading state while code is being fetched
  if (!code) {
    return (
      <Box sx={{ 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center", 
        height: "100vh",
        flexDirection: "column",
        gap: 2
      }}>
        <CircularProgress />
        <Typography>Loading diagram from database...</Typography>
      </Box>
    );
  }

  console.log("=== DIAGRAM RENDERING DEBUG ===");
  console.log("Code from database:", code.substring(0, 200));
  
  const detectDiagramType = (codeText) => {
    const trimmed = codeText.trim();
    console.log("Detecting type from:", trimmed.substring(0, 50));
    
    if (trimmed.startsWith('erDiagram')) return 'erDiagram';
    if (trimmed.startsWith('architecture-beta')) return 'architecture';
    if (trimmed.startsWith('sequenceDiagram')) return 'sequenceDiagram';
    if (trimmed.startsWith('block-beta')) return 'blockDiagram';
    if (trimmed.startsWith('requirementDiagram')) return 'requirement';
    if (trimmed.startsWith('journey')) return 'journey';
    if (trimmed.startsWith('graph') || trimmed.startsWith('flowchart')) return 'flowchart';
    return 'flowchart';
  };

  const diagramType = detectDiagramType(code);
  console.log("Detected diagram type:", diagramType);

  // Render the appropriate diagram view
  switch (diagramType) {
    case 'erDiagram':
      console.log("Rendering ERDiagramView");
      return <ERDiagramView color={color} fontSizes={fontSizes} />;
    case 'architecture':
      return <ArchitectureView color={color} fontSizes={fontSizes} />;
    case 'sequenceDiagram':
      return <SequenceDiagramView color={color}   fontSizes={{
        loopLabel: "16px",
        rotatedArrow: "36px", 
        message: "16px",
        fontSizes
      }} />; 
    case 'blockDiagram':
      return <BlockDiagramView color={color} fontSizes={fontSizes} />;
    case 'requirement':
      return <RequirementDiagramView color={color} fontSizes={fontSizes} />;
    case 'journey':
      return <UserJourneyChartView color={color} fontSizes={fontSizes} />;
    case 'flowchart':
    default:
      console.log("Rendering FlowchartView");
      return <FlowchartView color={color} fontSizes={fontSizes} />;
  }
};

export default DiagramView;