"use client";

import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  TextField,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  ConnectionMode,
  MarkerType,
  ReactFlowProvider,
  Handle,
  Position,
  BezierEdge,
  StraightEdge,
  SimpleBezierEdge,
  SmoothStepEdge,
  StepEdge,
  updateEdge,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { useStore } from "@/store";
import { ChartContext } from "@/app/layout";
import { useParams } from "next/navigation";
import Image from "next/image";

import {
  detectServiceType,
  serviceMappings,
} from "@/constants/cloudIconMapper";
import { FaServer } from "react-icons/fa";

const NodeActionsContext = React.createContext({
  detachService: () => {},
});

const GroupHoverContext = React.createContext({
  hoveredGroupId: null,
});

const SERVICE_NODE_SIZE = { width: 180, height: 120 };
const GROUP_NODE_SIZE = { width: 600, height: 400 };

const CloudIcon = ({ serviceType, size = 120, className = "" }) => {
  try {
    const { icon: IconComponent } = detectServiceType(serviceType);

    if (
      IconComponent &&
      typeof IconComponent === "object" &&
      IconComponent.src
    ) {
      return (
        <Image
          src={IconComponent}
          alt={serviceType || "cloud service"}
          width={size}
          height={size}
          className={className}
          style={{ width: size, height: size }}
        />
      );
    }

    if (IconComponent && typeof IconComponent === "function") {
      return <IconComponent size={size} className={className} />;
    }

    console.warn(`Invalid icon for service type: ${serviceType}`);
    return <FaServer size={size} className={className} />;
  } catch (error) {
    console.error("Error rendering CloudIcon:", error);
    return <FaServer size={size} className={className} />;
  }
};

const CustomEdge = (props) => {
  const mergedStyle = { ...(props.style || {}) };
  if (!mergedStyle.stroke) mergedStyle.stroke = "#000000";
  if (!mergedStyle.strokeWidth) mergedStyle.strokeWidth = 2;

  return (
    <SimpleBezierEdge
      {...props}
      style={mergedStyle}
      markerEnd={props.markerEnd}
    />
  );
};

const edgeTypes = {
  custom: CustomEdge,
  straight: StraightEdge,
  step: StepEdge,
  smoothstep: SmoothStepEdge,
};

const HANDLE_TO_CHAR = {
  left: "l",
  right: "r",
  top: "t",
  bottom: "b",
};

const CHAR_TO_HANDLE = {
  l: "left",
  r: "right",
  t: "top",
  b: "bottom",
};

const escapeRegExp = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getHandleChar = (handle, fallback) => {
  if (!handle) return fallback;
  const normalized = handle.toLowerCase();
  return HANDLE_TO_CHAR[normalized] || fallback;
};

const buildConnectionLine = (edgeLike) => {
  const sourceChar = getHandleChar(edgeLike.sourceHandle, "r");
  const targetChar = getHandleChar(edgeLike.targetHandle, "l");
  return `${edgeLike.source}:${sourceChar} -- ${targetChar}:${edgeLike.target}`;
};

const buildConnectionRegex = (edgeLike) => {
  const sourceChar = getHandleChar(edgeLike.sourceHandle, "r");
  const targetChar = getHandleChar(edgeLike.targetHandle, "l");
  return new RegExp(
    `^${escapeRegExp(edgeLike.source)}\\s*:\\s*${sourceChar}\\s*--\\s*${targetChar}\\s*:\\s*${escapeRegExp(
      edgeLike.target
    )}\\s*$`,
    "i"
  );
};

const GroupNode = ({ data, selected }) => {
  const { hoveredGroupId } = useContext(GroupHoverContext);
  const groupRef = useRef(null);
  const wrapperRef = useRef(null);
  const pointerStateRef = useRef({
    active: false,
    wrapper: null,
    pointerId: null,
    previousValue: "",
    capturedTarget: null,
  });

  const endPointerPassThrough = useCallback(() => {
    const state = pointerStateRef.current;
    if (state.capturedTarget && typeof state.pointerId === "number" && state.pointerId >= 0) {
      state.capturedTarget.releasePointerCapture?.(state.pointerId);
    }
    if (!state.active || !state.wrapper) {
      state.capturedTarget = null;
      state.pointerId = null;
      return;
    }
    state.wrapper.style.pointerEvents = state.previousValue;
    state.active = false;
    state.capturedTarget = null;
    state.wrapper = null;
    state.pointerId = null;
    state.previousValue = "";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleGlobalPointerEnd = (event) => {
      if (
        pointerStateRef.current.pointerId === (event.pointerId ?? "mouse")
      ) {
        endPointerPassThrough();
      }
    };
    window.addEventListener("pointerup", handleGlobalPointerEnd, true);
    window.addEventListener("pointercancel", handleGlobalPointerEnd, true);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerEnd, true);
      window.removeEventListener("pointercancel", handleGlobalPointerEnd, true);
    };
  }, [endPointerPassThrough]);

  const routeEventToEdge = useCallback((event, wrapper) => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      !wrapper
    ) {
      return false;
    }

    const state = pointerStateRef.current;

    const previous = wrapper.style.pointerEvents;
    wrapper.style.pointerEvents = "none";
    const underlying = document.elementFromPoint(
      event.clientX,
      event.clientY
    );
    wrapper.style.pointerEvents = previous;
    if (!underlying) return false;

    const updater = underlying.closest(".react-flow__edgeupdater");
    const targetEdge = updater || underlying.closest(".react-flow__edge");

    if (!targetEdge) {
      wrapper.style.cursor = "";
      return false;
    }

    const cursor = window.getComputedStyle(targetEdge).cursor;
    wrapper.style.cursor =
      cursor && cursor !== "auto" ? cursor : "pointer";

    const supportsPointerEvent =
      typeof window.PointerEvent !== "undefined" &&
      event instanceof window.PointerEvent;

    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      buttons: event.buttons ?? 0,
      button: event.button ?? 0,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      isPrimary:
        typeof event.isPrimary === "boolean" ? event.isPrimary : true,
    };

    if (supportsPointerEvent) {
      eventInit.pointerId = event.pointerId ?? 0;
      eventInit.pointerType = event.pointerType ?? "mouse";
      eventInit.pressure = event.pressure ?? 0;
      const syntheticPointer = new window.PointerEvent(
        event.type,
        eventInit
      );
      targetEdge.dispatchEvent(syntheticPointer);
    } else {
      const syntheticMouse = new MouseEvent(event.type, eventInit);
      targetEdge.dispatchEvent(syntheticMouse);
    }

    const pointerToMouseEventMap = {
      pointerdown: "mousedown",
      pointermove: "mousemove",
      pointerup: "mouseup",
    };
    const mouseEventType =
      pointerToMouseEventMap[event.type.toLowerCase()] || null;
    if (
      mouseEventType &&
      (event.pointerType === "mouse" || event.pointerType === undefined)
    ) {
      const mouseEvent = new MouseEvent(mouseEventType, eventInit);
      targetEdge.dispatchEvent(mouseEvent);
    }

    if (event.type === "pointerdown" && updater) {
      if (!state.active) {
        state.previousValue = wrapper.style.pointerEvents || "";
      }
      state.active = true;
      state.wrapper = wrapper;
      const pointerId = typeof event.pointerId === "number" ? event.pointerId : -1;
      state.pointerId = pointerId;
      state.capturedTarget = interactiveTarget;
      if (pointerId >= 0) {
        wrapper.releasePointerCapture?.(pointerId);
        interactiveTarget?.setPointerCapture?.(pointerId);
      }
    }

    event.preventDefault();
    event.stopPropagation();
    return true;
  }, []);

  const shouldBypassEvent = useCallback((event, wrapper) => {
    if (!wrapper) return false;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (target.closest(".react-flow__handle")) return false;
    if (target.closest("[data-group-interactive='true']")) return false;

    const targetNodeWrapper = target.closest(".react-flow__node");
    if (targetNodeWrapper && targetNodeWrapper !== wrapper) {
      return false;
    }
    return true;
  }, []);

  const handlePointerEvent = useCallback(
    (event) => {
      const wrapper = wrapperRef.current;
      if (!shouldBypassEvent(event, wrapper)) return;
      const handled = routeEventToEdge(event, wrapper);
      if (!handled && wrapper) {
        wrapper.style.cursor = "";
      }
      if (event.type === "pointerup" || event.type === "pointerleave") {
        endPointerPassThrough();
      }
    },
    [routeEventToEdge, shouldBypassEvent, endPointerPassThrough]
  );

  useEffect(() => {
    const wrapper = groupRef.current?.closest(".react-flow__node");
    if (!wrapper) return;
    wrapperRef.current = wrapper;

    const events = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointerover",
      "pointerout",
      "pointerenter",
      "pointerleave",
      "mousedown",
      "mousemove",
      "mouseup",
      "click",
    ];

    events.forEach((evt) =>
      wrapper.addEventListener(evt, handlePointerEvent, true)
    );

    return () => {
      events.forEach((evt) =>
        wrapper.removeEventListener(evt, handlePointerEvent, true)
      );
      if (wrapperRef.current === wrapper) {
        wrapperRef.current = null;
      }
      endPointerPassThrough();
    };
  }, [handlePointerEvent, endPointerPassThrough]);

  const textSizes = {
    typeFontSize: "14px",
    labelFontSize: "20px",
    nodeFontSize: "12px",
    handleSize: 10,
  };

  const custom = data?.customStyle || {};
  const borderColor = custom.outlineColor || "#000000";
  const borderStyle = custom.borderStyle || "dashed";
  const backgroundColor = custom.backgroundColor || "transparent";
  const isHovered = hoveredGroupId === data?.groupData?.id;

  return (
    <div
      ref={groupRef}
      style={{
        padding: "16px",
        border: selected || isHovered
          ? `3px ${borderStyle} ${borderColor}`
          : `2px ${borderStyle} ${borderColor}`,
        borderRadius: "0px",
        width: "100%",
        height: "100%",
        textAlign: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        fontFamily: "Arial, sans-serif",
        fontSize: textSizes.nodeFontSize,
        color: "#000000",
        position: "relative",
        boxSizing: "border-box",
        background: backgroundColor,
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        boxShadow: isHovered
          ? "0 0 12px rgba(0,0,0,0.25)"
          : "0 1px 3px rgba(0,0,0,0.3)",
        pointerEvents: "none",
      }}
    >
      <div
        data-group-interactive="true"
        style={{
          cursor: "grab",
          userSelect: "none",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            fontWeight: "bold",
            marginBottom: "8px",
            fontSize: textSizes.typeFontSize,
            color: "#000000",
            textTransform: "uppercase",
            borderBottom: "2px solid #000000",
            paddingBottom: "8px",
          }}
        >
          &lt;&lt;{data.groupData.type}&gt;&gt;
        </div>

        <div
          style={{
            fontWeight: "700",
            marginBottom: "8px",
            fontSize: textSizes.labelFontSize,
            color: "#000000",
            fontFamily: "monospace",
            lineHeight: "1.2",
          }}
        >
          {data.groupData.label}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{
          background: "#000000",
          width: textSizes.handleSize,
          height: textSizes.handleSize,
          pointerEvents: "auto",
        }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        style={{
          background: "#000000",
          width: textSizes.handleSize,
          height: textSizes.handleSize,
          pointerEvents: "auto",
        }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        style={{
          background: "#000000",
          width: textSizes.handleSize,
          height: textSizes.handleSize,
          pointerEvents: "auto",
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{
          background: "#000000",
          width: textSizes.handleSize,
          height: textSizes.handleSize,
          pointerEvents: "auto",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          background: "#000000",
          width: textSizes.handleSize,
          height: textSizes.handleSize,
          pointerEvents: "auto",
        }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        style={{
          background: "#000000",
          width: textSizes.handleSize,
          height: textSizes.handleSize,
          pointerEvents: "auto",
        }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        style={{
          background: "#000000",
          width: textSizes.handleSize,
          height: textSizes.handleSize,
          pointerEvents: "auto",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          background: "#000000",
          width: textSizes.handleSize,
          height: textSizes.handleSize,
          pointerEvents: "auto",
        }}
      />
    </div>
  );
};

const ServiceNode = ({ data, selected }) => {
  const { detachService } = useContext(NodeActionsContext);
  const serviceInfo = detectServiceType(data.serviceData.type);

  const getServiceStyle = (serviceInfo) => {
    const baseStyle = {
      border: "2px solid",
      background: "#ffffff",
      borderColor: serviceInfo.color,
    };

    const normalizedType = data.serviceData.type?.toLowerCase();

    if (
      normalizedType?.includes("disk") ||
      normalizedType?.includes("storage")
    ) {
      return { ...baseStyle, borderStyle: "groove" };
    }

    switch (normalizedType) {
      case "cloud":
        return { ...baseStyle, borderStyle: "dotted" };
      case "database":
        return { ...baseStyle, borderStyle: "double" };
      case "server":
        return { ...baseStyle, borderStyle: "solid" };
      case "machine":
        return { ...baseStyle, borderStyle: "solid", background: "#f5f5f5" };
      case "api":
        return { ...baseStyle, borderStyle: "dashed" };
      case "queue":
        return { ...baseStyle, borderStyle: "ridge" };
      default:
        return { ...baseStyle, borderStyle: "solid", background: "#f8f8f8" };
    }
  };

  const style = getServiceStyle(serviceInfo);
  const custom = data?.customStyle || {};
  if (custom.outlineColor) {
    style.borderColor = custom.outlineColor;
  }
  if (custom.backgroundColor) {
    style.background = custom.backgroundColor;
  }
  if (custom.borderStyle) {
    style.borderStyle = custom.borderStyle;
  }

  const textSizes = {
    iconSize: 64,
    providerFontSize: "10px",
    typeFontSize: "11px",
    labelFontSize: "14px",
    nodeFontSize: "12px",
  };

  const handleDetachClick = (event) => {
    event.stopPropagation();
    if (detachService && data?.serviceData?.id) {
      detachService(data.serviceData.id);
    }
  };

  return (
    <div
      style={{
        padding: "12px",
        background: style.background,
        border: `${style.borderWidth || "2px"} ${style.borderStyle} ${style.borderColor
          }`,
        borderRadius: "8px",
        width: "180px",
        minHeight: "100px",
        textAlign: "center",
        boxShadow: selected
          ? "0 4px 8px rgba(0,0,0,0.3)"
          : "0 2px 4px rgba(0,0,0,0.2)",
        fontFamily: "Arial, sans-serif",
        fontSize: textSizes.nodeFontSize,
        color: "#000000",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transition: "all 0.2s ease",
      }}
    >
      {data?.serviceData?.group && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 5,
          }}
        >
          <Tooltip title="Detach from group">
            <IconButton
              size="small"
              onClick={handleDetachClick}
              sx={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                backgroundColor: "rgba(255,255,255,0.9)",
                "&:hover": { backgroundColor: "rgba(255,255,255,1)" },
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </div>
      )}
      <div
        style={{
          marginBottom: "8px",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <CloudIcon
          serviceType={data.serviceData.type}
          size={textSizes.iconSize}
        />
        <div
          style={{
            fontSize: textSizes.providerFontSize,
            background: serviceInfo.color,
            color: "white",
            padding: "2px 6px",
            borderRadius: "10px",
            marginTop: "4px",
            textTransform: "uppercase",
            fontWeight: "bold",
          }}
        >
          {serviceInfo.provider}
        </div>
      </div>

      <div
        style={{
          fontWeight: "bold",
          marginBottom: "6px",
          fontSize: textSizes.typeFontSize,
          color: style.borderColor || serviceInfo.color,
          textTransform: "uppercase",
          borderBottom: `1px solid ${style.borderColor || serviceInfo.color}`,
          paddingBottom: "4px",
          width: "100%",
        }}
      >
        {data.serviceData.type}
      </div>

      <div
        style={{
          fontWeight: "700",
          marginBottom: "6px",
          fontSize: textSizes.labelFontSize,
          color: "#000000",
          fontFamily: "monospace",
          lineHeight: "1.2",
        }}
      >
        {data.serviceData.label}
      </div>

      {["top", "bottom", "left", "right"].map((position) => (
        <React.Fragment key={position}>
          <Handle
            type="target"
            position={
              Position[position.charAt(0).toUpperCase() + position.slice(1)]
            }
            id={position}
            style={{
              background: serviceInfo.color,
              width: 8,
              height: 8,
              border: "1px solid white",
            }}
          />
          <Handle
            type="source"
            position={
              Position[position.charAt(0).toUpperCase() + position.slice(1)]
            }
            id={position}
            style={{
              background: serviceInfo.color,
              width: 8,
              height: 8,
              border: "1px solid white",
            }}
          />
        </React.Fragment>
      ))}
    </div>
  );
};

const nodeTypes = {
  group: GroupNode,
  service: ServiceNode,
};

const StatusDisplay = ({ message, type = "info" }) => {
  if (!message) return null;

  const backgroundColor = type === "error" ? "#ffebee" : "#e8f5e8";
  const borderColor = type === "error" ? "#f44336" : "#4caf50";
  const textColor = type === "error" ? "#c62828" : "#2e7d32";

  return (
    <Paper
      sx={{
        position: "absolute",
        top: 80,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        padding: "8px 16px",
        background: backgroundColor,
        border: `2px solid ${borderColor}`,
        borderRadius: "4px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        maxWidth: "400px",
      }}
    >
      <Typography
        variant="body2"
        sx={{
          color: textColor,
          fontWeight: 500,
          fontSize: "12px",
          textAlign: "center",
        }}
      >
        {message}
      </Typography>
    </Paper>
  );
};

const EditPanel = ({ selectedNode, onSave, onClose, onUpdate }) => {
  const [formData, setFormData] = useState({});

  const serviceTypes = Object.keys(serviceMappings).sort();

  useEffect(() => {
    if (selectedNode) {
      if (selectedNode.data.nodeType === "group") {
        setFormData({
          label: selectedNode.data.groupData.label,
          type: selectedNode.data.groupData.type,
          outlineColor: selectedNode.data.customStyle?.outlineColor || "",
          backgroundColor: selectedNode.data.customStyle?.backgroundColor || "",
          borderStyle: selectedNode.data.customStyle?.borderStyle || "",
        });
      } else if (selectedNode.data.nodeType === "service") {
        setFormData({
          label: selectedNode.data.serviceData.label,
          type: selectedNode.data.serviceData.type,
          outlineColor: selectedNode.data.customStyle?.outlineColor || "",
          backgroundColor: selectedNode.data.customStyle?.backgroundColor || "",
          borderStyle: selectedNode.data.customStyle?.borderStyle || "",
        });
      }
    }
  }, [selectedNode]);

  const handleChange = (field, value) => {
    const updatedData = { ...formData, [field]: value };
    setFormData(updatedData);

    if (onUpdate) {
      onUpdate(selectedNode.id, updatedData);
    }
  };

  const handleSave = () => {
    if (onSave && selectedNode) {
      onSave(selectedNode.id, formData, selectedNode.data.nodeType);
    }
  };

  const getIconUrl = (serviceType) => {
    const mapping = serviceMappings[serviceType];
    if (mapping && mapping.icon) {
      if (typeof mapping.icon === "object" && mapping.icon.src) {
        return mapping.icon.src;
      }
      if (typeof mapping.icon === "string") {
        return mapping.icon;
      }
    }
    return null;
  };

  if (!selectedNode) return null;

  const nodeType = selectedNode.data.nodeType;

  return (
    <Paper
      sx={{
        position: "absolute",
        top: 20,
        left: 20,
        zIndex: 1000,
        padding: "16px",
        minWidth: "300px",
        background: "white",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        border: "2px solid #000000",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 2,
        }}
      >
        <h3 style={{ margin: 0, color: "#000000", fontSize: "14px" }}>
          Edit {nodeType}: {selectedNode.id}
        </h3>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label="Label"
          size="small"
          value={formData.label || ""}
          onChange={(e) => handleChange("label", e.target.value)}
        />

        {nodeType === "service" ? (
          <FormControl size="small" fullWidth>
            <InputLabel>Service Type</InputLabel>
            <Select
              value={formData.type || ""}
              label="Service Type"
              onChange={(e) => handleChange("type", e.target.value)}
              renderValue={(selected) => {
                const iconUrl = getIconUrl(selected);
                return (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {iconUrl && (
                      <img
                        src={iconUrl}
                        alt={selected}
                        style={{ width: 20, height: 20 }}
                      />
                    )}
                    {selected}
                  </Box>
                );
              }}
            >
              {serviceTypes.map((serviceType) => {
                const iconUrl = getIconUrl(serviceType);
                return (
                  <MenuItem key={serviceType} value={serviceType}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {iconUrl && (
                        <img
                          src={iconUrl}
                          alt={serviceType}
                          style={{ width: 20, height: 20 }}
                        />
                      )}
                      <Typography>{serviceType}</Typography>
                    </Box>
                  </MenuItem>
                );
              })}
            </Select>
            <FormHelperText>
              Select from available Azure service types
            </FormHelperText>
          </FormControl>
        ) : (
          <TextField
            label="Group Type"
            size="small"
            value={formData.type || ""}
            onChange={(e) => handleChange("type", e.target.value)}
            placeholder="e.g., azure, aws, gcp, network-hub"
            helperText="Common groups: azure, aws, gcp, iot-system, data-platform, ai-platform, network-hub"
          />
        )}

        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            type="color"
            size="small"
            label="Outline"
            value={formData.outlineColor || ""}
            onChange={(e) => handleChange("outlineColor", e.target.value)}
            sx={{ width: 110 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="color"
            size="small"
            label="Background"
            value={formData.backgroundColor || ""}
            onChange={(e) => handleChange("backgroundColor", e.target.value)}
            sx={{ width: 130 }}
            InputLabelProps={{ shrink: true }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="border-style-label">Border Style</InputLabel>
            <Select
              labelId="border-style-label"
              label="Border Style"
              value={formData.borderStyle || ""}
              onChange={(e) => handleChange("borderStyle", e.target.value)}
            >
              <MenuItem value="">Default</MenuItem>
              <MenuItem value="solid">Solid</MenuItem>
              <MenuItem value="dashed">Dashed</MenuItem>
              <MenuItem value="dotted">Dotted</MenuItem>
              <MenuItem value="double">Double</MenuItem>
              <MenuItem value="groove">Groove</MenuItem>
              <MenuItem value="ridge">Ridge</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
          <Button
            variant="outlined"
            size="small"
            onClick={onClose}
            sx={{ borderColor: "#000000", color: "#000000" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleSave}
            startIcon={<SaveIcon />}
            sx={{
              backgroundColor: "#000000",
              color: "#ffffff",
              "&:hover": {
                backgroundColor: "#333333",
              },
            }}
          >
            Save
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

const ArchitectureDiagramView = ({ color, fontSizes }) => {
  const { chartRef } = useContext(ChartContext);
  const code = useStore.use.code();
  const setCode = useStore.use.setCode();
  const setSvg = useStore.use.setSvg();
  const { id } = useParams();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesStateChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [hoveredGroupId, setHoveredGroupId] = useState(null);
  const updatingEdgeIdRef = useRef(null);

  const [preventRerender, setPreventRerender] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const reactFlow = useReactFlow();
  const codeRef = useRef(code);
  codeRef.current = code;
  const nodesRef = useRef([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const pendingCodeFrame = useRef(null);

  const commitCodeUpdate = useCallback(
    (nextCode) => {
      const finalCode = nextCode ?? "";
      codeRef.current = finalCode;

      const applyUpdate = () => {
        pendingCodeFrame.current = null;
        setCode(finalCode);
      };

      if (typeof window === "undefined") {
        applyUpdate();
        return;
      }

      if (pendingCodeFrame.current) {
        cancelAnimationFrame(pendingCodeFrame.current);
      }

      pendingCodeFrame.current = requestAnimationFrame(applyUpdate);
    },
    [setCode]
  );

  useEffect(() => {
    return () => {
      if (pendingCodeFrame.current && typeof window !== "undefined") {
        cancelAnimationFrame(pendingCodeFrame.current);
        pendingCodeFrame.current = null;
      }
    };
  }, []);

  const getNodeDimensions = useCallback(
    (nodeId, fallback = SERVICE_NODE_SIZE) => {
      const rfNode = reactFlow?.getNode?.(nodeId);
      const measuredWidth =
        rfNode?.measured?.width ?? rfNode?.width ?? fallback.width;
      const measuredHeight =
        rfNode?.measured?.height ?? rfNode?.height ?? fallback.height;
      return { width: measuredWidth, height: measuredHeight };
    },
    [reactFlow]
  );

  const getAbsoluteNodePosition = useCallback((node, snapshot = nodesRef.current) => {
    if (!node) return { x: 0, y: 0 };
    let x = node.position?.x || 0;
    let y = node.position?.y || 0;
    let currentParentId = node.parentNode;

    while (currentParentId) {
      const parent = snapshot.find((n) => n.id === currentParentId);
      if (!parent) break;
      x += parent.position?.x || 0;
      y += parent.position?.y || 0;
      currentParentId = parent.parentNode;
    }

    return { x, y };
  }, []);

  const clampRelativePositionToGroup = useCallback(
    (relativePosition, groupNode, nodeSize = SERVICE_NODE_SIZE) => {
      if (!groupNode) return relativePosition;
      const fallback = {
        width: groupNode.style?.width || GROUP_NODE_SIZE.width,
        height: groupNode.style?.height || GROUP_NODE_SIZE.height,
      };
      const groupSize = getNodeDimensions(groupNode.id, fallback);
      const padding = 20;
      const maxX = Math.max(
        padding,
        groupSize.width - nodeSize.width - padding
      );
      const maxY = Math.max(
        padding,
        groupSize.height - nodeSize.height - padding
      );

      return {
        x: Math.min(Math.max(relativePosition.x, padding), maxX),
        y: Math.min(Math.max(relativePosition.y, padding), maxY),
      };
    },
    [getNodeDimensions]
  );

  const updateServiceGroupInCode = useCallback(
    (serviceId, nextGroupId) => {
      if (!serviceId) return;
      const currentCode = codeRef.current || "";
      const lines = currentCode.split("\n");
      const updatedLines = lines.map((line) => {
        if (!line.trim().startsWith(`service ${serviceId}`)) return line;
        const sanitized = line.replace(/\s+in\s+\w+$/, "");
        return nextGroupId ? `${sanitized} in ${nextGroupId}` : sanitized;
      });

      commitCodeUpdate(updatedLines.join("\n"));
    },
    [commitCodeUpdate]
  );

  const findContainingGroup = useCallback(
    (absoluteCenter, excludeGroupId = null, snapshot = nodesRef.current) => {
      return snapshot
        .filter((node) => node.type === "group" && node.id !== excludeGroupId)
        .find((groupNode) => {
          const fallback = {
            width: groupNode.style?.width || GROUP_NODE_SIZE.width,
            height: groupNode.style?.height || GROUP_NODE_SIZE.height,
          };
          const size = getNodeDimensions(groupNode.id, fallback);
          const groupPosition = getAbsoluteNodePosition(groupNode, snapshot);

          return (
            absoluteCenter.x >= groupPosition.x &&
            absoluteCenter.x <= groupPosition.x + size.width &&
            absoluteCenter.y >= groupPosition.y &&
            absoluteCenter.y <= groupPosition.y + size.height
          );
        });
    },
    [getAbsoluteNodePosition, getNodeDimensions]
  );

  const removeConnectionsFromCode = useCallback(
    (edgesToRemove) => {
      if (!edgesToRemove?.length) {
        return;
      }

      const currentCode = codeRef.current || "";
      const lines = currentCode.split("\n");

      const regexEntries = edgesToRemove.map((edge) => ({
        regex: buildConnectionRegex(edge),
        matched: false,
      }));

      const filteredLines = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;

        const matchEntry = regexEntries.find(
          (entry) => !entry.matched && entry.regex.test(trimmed)
        );

        if (matchEntry) {
          matchEntry.matched = true;
          return false;
        }

        // Also remove corresponding EdgeStyle lines for the same connections
        if (trimmed.startsWith("%% EdgeStyle:")) {
          const after = trimmed.replace(/^%%\s*EdgeStyle:\s*/, "");
          const key = (after.split("=")[0] || "").trim();
          if (edgesToRemove.some((e) => buildConnectionLine(e) === key)) {
            return false;
          }
        }

        return true;
      });

      commitCodeUpdate(filteredLines.join("\n"));
    },
    [commitCodeUpdate]
  );

  const replaceConnectionInCode = useCallback(
    (oldEdge, newEdge) => {
      if (!newEdge) return;

      const currentCode = codeRef.current || "";
      const lines = currentCode.split("\n");
      const regex = oldEdge ? buildConnectionRegex(oldEdge) : null;
      let replaced = false;

      const oldKey = oldEdge ? buildConnectionLine(oldEdge) : null;
      const newKey = buildConnectionLine(newEdge);

      const nextLines = lines.map((line) => {
        if (regex && !replaced && regex.test(line.trim())) {
          replaced = true;
          return newKey;
        }
        // Also migrate EdgeStyle mapping if exists
        if (oldKey && line.trim().startsWith("%% EdgeStyle:")) {
          const after = line.trim().replace(/^%%\s*EdgeStyle:\s*/, "");
          const keyPart = (after.split("=")[0] || "").trim();
          const stylePart = after.includes("=") ? after.substring(after.indexOf("=") + 1).trim() : "";
          if (keyPart === oldKey) {
            return `%% EdgeStyle: ${newKey} = ${stylePart}`;
          }
        }
        return line;
      });

      const finalLines = replaced
        ? nextLines
        : [...nextLines, buildConnectionLine(newEdge)];

      commitCodeUpdate(finalLines.join("\n"));
    },
    [commitCodeUpdate]
  );

  const upsertNodeStyleInCode = useCallback(
    (nodeId, styleObj) => {
      const currentCode = codeRef.current || "";
      const lines = currentCode.split("\n");
      const filtered = lines.filter(
        (line) => !line.trim().startsWith(`%% NodeStyle: ${nodeId}`)
      );

      const parts = [];
      if (styleObj?.outlineColor) parts.push(`outline:${styleObj.outlineColor}`);
      if (styleObj?.backgroundColor)
        parts.push(`bg:${styleObj.backgroundColor}`);
      if (styleObj?.borderStyle) parts.push(`borderStyle:${styleObj.borderStyle}`);

      const styleLine = parts.length
        ? `%% NodeStyle: ${nodeId} = ${parts.join("; ")}`
        : null;

      const updated = styleLine ? [...filtered, styleLine] : filtered;
      commitCodeUpdate(updated.join("\n"));
    },
    [commitCodeUpdate]
  );


  const upsertEdgeStyleInCode = useCallback(
    (edgeLike) => {
      const key = buildConnectionLine(edgeLike);
      const currentCode = codeRef.current || "";
      const lines = currentCode.split("\n");
      const withoutOld = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("%% EdgeStyle:")) return true;
        const after = trimmed.replace(/^%%\s*EdgeStyle:\s*/, "");
        const oldKey = (after.split("=")[0] || "").trim();
        return oldKey !== key;
      });

      const parts = [];
      if (edgeLike?.style?.stroke) parts.push(`stroke:${edgeLike.style.stroke}`);
      if (edgeLike?.style?.strokeDasharray) parts.push(`dash:${edgeLike.style.strokeDasharray}`);
      if (edgeLike?.type && edgeLike.type !== "custom") parts.push(`type:${edgeLike.type}`);

      let arrow = "none";
      if (edgeLike?.markerEnd?.type === MarkerType.ArrowClosed) arrow = "closed";
      else if (edgeLike?.markerEnd?.type === MarkerType.Arrow) arrow = "open";
      if (arrow && arrow !== "none") parts.push(`arrow:${arrow}`);

      const styleLine = parts.length
        ? `%% EdgeStyle: ${key} = ${parts.join("; ")}`
        : null;

      const updated = styleLine ? [...withoutOld, styleLine] : withoutOld;
      commitCodeUpdate(updated.join("\n"));
    },
    [commitCodeUpdate]
  );

  const handleEdgeClick = useCallback(
    (event, edge) => {
      event.stopPropagation();
      setSelectedEdge(edge);
      setSelectedNode(null);
    },
    [setSelectedEdge, setSelectedNode]
  );

  const handleDeleteEdge = useCallback(
    (edgeId) => {
      const edgeToRemove = edges.find((edge) => edge.id === edgeId);
      if (!edgeToRemove) return;

      setPreventRerender(true);
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => edge.id !== edgeId)
      );
      removeConnectionsFromCode([edgeToRemove]);
      setSelectedEdge(null);
      setStatusMessage(
        `Connection removed: ${edgeToRemove.source} → ${edgeToRemove.target}`
      );
      setTimeout(() => setStatusMessage(""), 3000);
      setTimeout(() => setPreventRerender(false), 100);
    },
    [
      edges,
      removeConnectionsFromCode,
      setEdges,
      setPreventRerender,
      setStatusMessage,
      setSelectedEdge,
    ]
  );

  const handleEdgeUpdate = useCallback(
    (oldEdge, newConnection) => {
      if (!oldEdge || !newConnection?.source || !newConnection?.target) {
        return;
      }

      const updatedEdge = {
        ...oldEdge,
        ...newConnection,
        sourceHandle: newConnection.sourceHandle || oldEdge.sourceHandle || "right",
        targetHandle: newConnection.targetHandle || oldEdge.targetHandle || "left",
        selectable: true,
        updatable: true,
        interactionWidth: 30,
      };

      setPreventRerender(true);

      setEdges((eds) => updateEdge(oldEdge, updatedEdge, eds));
      replaceConnectionInCode(oldEdge, updatedEdge);
      upsertEdgeStyleInCode(updatedEdge);
      setSelectedEdge(updatedEdge);

      setStatusMessage(`Connection updated: ${updatedEdge.source} → ${updatedEdge.target}`);
      setTimeout(() => setStatusMessage(""), 1500);
      setTimeout(() => {
        updatingEdgeIdRef.current = null;
        setPreventRerender(false);
      }, 120);
    },
    [
      replaceConnectionInCode,
      upsertEdgeStyleInCode,
      setEdges,
      setPreventRerender,
      setStatusMessage,
      setSelectedEdge,
    ]
  );


  const handleEdgesChange = useCallback(
    (changes) => {
      const currentUpdatingId = updatingEdgeIdRef.current;

      const removedEdges = changes
        .filter((change) => change.type === "remove")
        .map((change) => edges.find((edge) => edge.id === change.id))
        .filter((edge) => edge && edge.id !== currentUpdatingId);

      if (removedEdges.length > 0) {
        setPreventRerender(true);
        removeConnectionsFromCode(removedEdges);
        if (
          selectedEdge &&
          removedEdges.some((edge) => edge.id === selectedEdge.id)
        ) {
          setSelectedEdge(null);
        }
        setStatusMessage(
          removedEdges.length === 1
            ? `Connection removed: ${removedEdges[0].source} → ${removedEdges[0].target}`
            : `${removedEdges.length} connections removed`
        );
        setTimeout(() => setStatusMessage(""), 3000);
        setTimeout(() => setPreventRerender(false), 100);
      }

      const filteredChanges =
        currentUpdatingId && changes.length
          ? changes.filter(
              (change) =>
                !(
                  change.type === "remove" && change.id === currentUpdatingId
                )
            )
          : changes;

      if (filteredChanges.length > 0) {
        onEdgesStateChange(filteredChanges);
      }
    },
    [
      edges,
      onEdgesStateChange,
      removeConnectionsFromCode,
      selectedEdge,
      setSelectedEdge,
      setPreventRerender,
      setStatusMessage,
    ]
  );

  const handleEdgeUpdateStart = useCallback((_, edge) => {
    updatingEdgeIdRef.current = edge?.id || null;
  }, []);

  const handleEdgeUpdateEnd = useCallback(() => {
    updatingEdgeIdRef.current = null;
  }, []);

  const addTheme = [
    {
      name: "default",
      style: {
        primaryColor: "#FFFFFF",
        primaryBorderColor: "#ff5733",
      },
    },
    {
      name: "forest",
      style: {
        primaryColor: "#2E8B57",
        primaryBorderColor: "#145214",
      },
    },
    {
      name: "base",
      style: {
        primaryColor: "#F0F0F0",
        primaryBorderColor: "#ff5733",
      },
    },
    {
      name: "dark",
      style: {
        primaryColor: "#333333",
        primaryBorderColor: "#ff5733",
      },
    },
    {
      name: "neutral",
      style: {
        primaryColor: "#CCCCCC",
        primaryBorderColor: "#ff5733",
      },
    },
    {
      name: "ocean",
      style: {
        primaryColor: "#71BBB2",
        primaryBorderColor: "#497D74",
      },
    },
    {
      name: "solarized",
      style: {
        primaryColor: "#A27B5C",
        primaryBorderColor: "#3F4F44",
      },
    },
    {
      name: "sunset",
      style: {
        primaryColor: "#FFCDB2",
        primaryBorderColor: "#E5989B",
      },
    },
    {
      name: "neon",
      style: {
        primaryColor: "#B6FFA1",
        primaryBorderColor: "#00FF9C",
      },
    },
    {
      name: "monochrome",
      style: {
        primaryColor: "#A7B49E",
        primaryBorderColor: "#818C78",
      },
    },
    {
      name: "lavender",
      style: {
        primaryColor: "#CDA4DE",
        primaryBorderColor: "#8E44AD",
      },
    },
    {
      name: "citrus",
      style: {
        primaryColor: "#FFD166",
        primaryBorderColor: "#EF476F",
      },
    },
    {
      name: "midnight",
      style: {
        primaryColor: "#2C3E50",
        primaryBorderColor: "#1A252F",
      },
    },
    {
      name: "pastel",
      style: {
        primaryColor: "#FFB7B2",
        primaryBorderColor: "#FFDAC1",
      },
    },
  ];

  const parseArchitectureCode = useCallback((text) => {
    const result = {
      groups: new Map(),
      services: new Map(),
      connections: [],
      positions: new Map(),
      nodeStyles: new Map(),
      edgeStyles: new Map(),
    };

    if (!text) {
      return result;
    }

    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line === "architecture-beta") continue;

      const posMatch = line.match(
        /^%%\s*Position:\s*(\w+)\s*=\s*\[(-?\d+),\s*(-?\d+)\]/
      );
      if (posMatch) {
        const [, id, x, y] = posMatch;
        result.positions.set(id, { x: parseInt(x), y: parseInt(y) });
        continue;
      }

      // Node position
      if (line.startsWith("%%")) {
        // Node style: %% NodeStyle: <id> = key:value; key:value
        const nodeStyleMatch = line.match(/^%%\s*NodeStyle:\s*(\w+)\s*=\s*(.+)$/);
        if (nodeStyleMatch) {
          const [, id, styleStr] = nodeStyleMatch;
          const style = {};
          styleStr
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((entry) => {
              const [k, v] = entry.split(":").map((x) => (x || "").trim());
              if (!k) return;
              if (k === "outline") style.outlineColor = v;
              else if (k === "bg") style.backgroundColor = v;
              else if (k === "borderStyle") style.borderStyle = v;
            });
          result.nodeStyles.set(id, style);
          continue;
        }

        // Edge style: %% EdgeStyle: <source:s -- t:target> = key:value; key:value
        const edgeStyleMatch = line.match(/^%%\s*EdgeStyle:\s*(.+?)\s*=\s*(.+)$/);
        if (edgeStyleMatch) {
          const [, key, styleStr] = edgeStyleMatch;
          const normKey = key.trim();
          const style = {};
          styleStr
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((entry) => {
              const [k, vRaw] = entry.split(":");
              const kTrim = (k || "").trim();
              const v = (vRaw || "").trim();
              if (!kTrim) return;
              if (kTrim === "stroke") style.stroke = v;
              else if (kTrim === "dash") style.dash = v;
              else if (kTrim === "arrow") style.arrow = v;
              else if (kTrim === "type") style.type = v.toLowerCase();
            });
          result.edgeStyles.set(normKey, style);
          continue;
        }

        continue;
      }

      const groupMatch = line.match(
        /^group\s+(\w+)\s*\(\s*([^)]+)\s*\)\s*\[\s*([^\]]+)\s*\]$/
      );
      if (groupMatch) {
        const [, id, type, label] = groupMatch;
        result.groups.set(id, { id, type: type.trim(), label: label.trim() });
        continue;
      }

      const serviceMatch = line.match(
        /^service\s+(\w+)\s*\(\s*([^)]+)\s*\)\s*\[\s*([^\]]+)\s*\]\s*(?:in\s+(\w+))?$/
      );
      if (serviceMatch) {
        const [, id, type, label, group] = serviceMatch;
        result.services.set(id, {
          id,
          type: type.trim(),
          label: label.trim(),
          group: group ? group.trim() : null,
        });
        continue;
      }

      const connectionMatch = line.match(
        /^(\w+)\s*:\s*([LlRrTtBb])\s*--\s*([LlRrTtBb])\s*:\s*(\w+)$/
      );
      if (connectionMatch) {
        const [, sourceId, sourceSide, targetSide, targetId] = connectionMatch;
        result.connections.push({
          sourceId: sourceId.trim(),
          sourceSide: sourceSide.trim().toLowerCase(),
          targetId: targetId.trim(),
          targetSide: targetSide.trim().toLowerCase(),
        });
      }
    }

    return result;
  }, []);

  const buildTreeStructure = useCallback((services, connections) => {
    const graph = new Map();
    const inDegree = new Map();
    const serviceMap = new Map(services.map((s) => [s.id, s]));

    services.forEach((service) => {
      graph.set(service.id, []);
      inDegree.set(service.id, 0);
    });

    connections.forEach((conn) => {
      if (graph.has(conn.sourceId) && graph.has(conn.targetId)) {
        graph.get(conn.sourceId).push(conn.targetId);
        inDegree.set(conn.targetId, inDegree.get(conn.targetId) + 1);
      }
    });

    const roots = services.filter((service) => inDegree.get(service.id) === 0);

    if (roots.length === 0) {
      const minInDegree = Math.min(...Array.from(inDegree.values()));
      roots.push(
        ...services.filter(
          (service) => inDegree.get(service.id) === minInDegree
        )
      );
    }

    const levels = [];
    const visited = new Set();
    let currentLevel = [...roots];

    while (currentLevel.length > 0) {
      levels.push([...currentLevel]);
      const nextLevel = [];

      currentLevel.forEach((service) => {
        visited.add(service.id);
        const neighbors = graph.get(service.id) || [];

        neighbors.forEach((neighborId) => {
          if (!visited.has(neighborId)) {
            const neighbor = serviceMap.get(neighborId);
            if (neighbor && !nextLevel.some((n) => n.id === neighborId)) {
              nextLevel.push(neighbor);
            }
          }
        });
      });

      currentLevel = nextLevel;
    }

    services.forEach((service) => {
      if (!visited.has(service.id)) {
        if (levels.length === 0) levels.push([]);
        if (!levels[0].some((s) => s.id === service.id)) {
          levels[0].push(service);
        }
      }
    });

    return {
      levels,
      roots,
      graph,
      inDegree,
    };
  }, []);

  const calculateServicePositions = useCallback(
    (services, connections) => {
      const positions = new Map();
      if (!services || services.length === 0) {
        return positions;
      }

      const serviceSet = new Set(services.map((service) => service.id));
      const filteredConnections = connections.filter(
        (conn) => serviceSet.has(conn.sourceId) && serviceSet.has(conn.targetId)
      );

      const reverseGraph = new Map();

      services.forEach((service) => {
        reverseGraph.set(service.id, []);
      });

      filteredConnections.forEach((conn) => {
        reverseGraph.get(conn.targetId)?.push(conn.sourceId);
      });

      const depthMemo = new Map();
      const visiting = new Set();
      const resolveDepth = (serviceId) => {
        if (depthMemo.has(serviceId)) return depthMemo.get(serviceId);
        if (visiting.has(serviceId)) {
          depthMemo.set(serviceId, 0);
          return 0;
        }
        visiting.add(serviceId);
        const parents = reverseGraph.get(serviceId) || [];
        if (parents.length === 0) {
          depthMemo.set(serviceId, 0);
          visiting.delete(serviceId);
          return 0;
        }
        const parentDepths = parents
          .map((parentId) => resolveDepth(parentId))
          .filter((depth) => typeof depth === "number");
        const depth = (parentDepths.length ? Math.max(...parentDepths) : 0) + 1;
        depthMemo.set(serviceId, depth);
        visiting.delete(serviceId);
        return depth;
      };

      services.forEach((service) => resolveDepth(service.id));

      const columnMap = new Map();
      services.forEach((service) => {
        const depth = depthMemo.get(service.id) ?? 0;
        if (!columnMap.has(depth)) {
          columnMap.set(depth, []);
        }
        columnMap.get(depth).push(service);
      });

      const columnKeys = Array.from(columnMap.keys()).sort((a, b) => a - b);

      const serviceWidth = 180;
      const serviceHeight = 100;
      const verticalSpacing = 260;
      const horizontalSpacing = 140;
      const innerWrapSpacing = 180;
      const maxNodesPerRow = 4;

      const rowAssignments = new Map();
      const getPreferredRow = (serviceId) => {
        const parents = reverseGraph.get(serviceId) || [];
        const parentRows = parents
          .map((parentId) => rowAssignments.get(parentId))
          .filter((row) => typeof row === "number")
          .sort((a, b) => a - b);

        if (parentRows.length === 0) {
          return null;
        }

        const mid = Math.floor(parentRows.length / 2);
        if (parentRows.length % 2 === 0) {
          return (parentRows[mid - 1] + parentRows[mid]) / 2;
        }
        return parentRows[mid];
      };

      columnKeys.forEach((columnIndex) => {
        const columnServices = columnMap.get(columnIndex) || [];
        columnServices.sort((a, b) => {
          const aPref = getPreferredRow(a.id);
          const bPref = getPreferredRow(b.id);

          if (aPref === null && bPref === null) {
            return a.id.localeCompare(b.id);
          }
          if (aPref === null) return 1;
          if (bPref === null) return -1;
          if (aPref === bPref) {
            return a.id.localeCompare(b.id);
          }
          return aPref - bPref;
        });

        columnServices.forEach((service, index) => {
          const wrapIndex = Math.floor(index / maxNodesPerRow);
          const rowIndex = index % maxNodesPerRow;
          const x =
            rowIndex * (serviceWidth + horizontalSpacing) +
            wrapIndex * (serviceWidth + innerWrapSpacing);
          const y = columnIndex * (serviceHeight + verticalSpacing);

          positions.set(service.id, { x, y });
          rowAssignments.set(
            service.id,
            rowIndex + wrapIndex * maxNodesPerRow
          );
        });
      });

      return positions;
    },
    []
  );

  const calculateGroupSizeFromServicePositions = useCallback((services, servicePositions) => {
    if (services.length === 0) {
      return { width: 800, height: 400 };
    }

    const serviceWidth = 180;
    const serviceHeight = 100;
    const horizontalMargin = 200;
    const verticalMargin = 150;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    services.forEach((service) => {
      const position = servicePositions.get(service.id);
      if (position) {
        minX = Math.min(minX, position.x);
        maxX = Math.max(maxX, position.x + serviceWidth);
        minY = Math.min(minY, position.y);
        maxY = Math.max(maxY, position.y + serviceHeight);
      }
    });

    if (!isFinite(minX) || !isFinite(minY)) {
      return { width: 1000, height: 600 };
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    return {
      width: Math.max(800, contentWidth + horizontalMargin * 2),
      height: Math.max(400, contentHeight + verticalMargin * 2),
    };
  }, []);

  const adjustServicePositionsToGroup = useCallback((services, servicePositions, groupPosition, groupSize) => {
    const adjustedPositions = new Map();
    const serviceWidth = 180;
    const serviceHeight = 100;
    const layoutPadding = 60;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    services.forEach((service) => {
      const position = servicePositions.get(service.id);
      if (position) {
        minX = Math.min(minX, position.x);
        maxX = Math.max(maxX, position.x);
        minY = Math.min(minY, position.y);
        maxY = Math.max(maxY, position.y);
      }
    });

    const rawWidth = maxX - minX + serviceWidth;
    const rawHeight = maxY - minY + serviceHeight;
    const availableWidth = groupSize.width - 100;
    const availableHeight = groupSize.height - 100;

    const scaleX = rawWidth > availableWidth ? availableWidth / rawWidth : 1;
    const scaleY = rawHeight > availableHeight ? availableHeight / rawHeight : 1;
    const scale = Math.min(scaleX, scaleY);
    const scaledContentWidth = rawWidth * scale;
    const scaledContentHeight = rawHeight * scale;
    const horizontalPadding = Math.max(
      layoutPadding,
      (groupSize.width - scaledContentWidth) / 2
    );
    const verticalPadding = Math.max(
      layoutPadding,
      (groupSize.height - scaledContentHeight) / 2
    );

    services.forEach((service) => {
      const originalPosition = servicePositions.get(service.id);
      if (originalPosition) {
        const scaledX = (originalPosition.x - minX) * scale;
        const scaledY = (originalPosition.y - minY) * scale;

        const offsetX = horizontalPadding + scaledX;
        const offsetY = verticalPadding + scaledY;

        const boundedX = Math.min(
          Math.max(offsetX, layoutPadding),
          groupSize.width - serviceWidth - layoutPadding
        );
        const boundedY = Math.min(
          Math.max(offsetY, layoutPadding),
          groupSize.height - serviceHeight - layoutPadding
        );

        adjustedPositions.set(service.id, { x: boundedX, y: boundedY });
      } else {
        adjustedPositions.set(service.id, {
          x: 100,
          y: 100
        });
      }
    });

    return adjustedPositions;
  }, []);

  const createFlowElements = useCallback(
    (archData) => {
      const nodes = [];
      const edges = [];
      const allNodesMap = new Map();

      const groupHorizontalSpacing = 200;
      const groupVerticalSpacing = 180;
      const layoutPadding = { x: 120, y: 80 };

      const groupsArray = Array.from(archData.groups.values());

      const preparedGroups = groupsArray.map((group) => {
        const servicesInGroup = Array.from(archData.services.values()).filter(
          (s) => s.group === group.id
        );

        const groupServiceIds = new Set(servicesInGroup.map((s) => s.id));
        const groupConnections = archData.connections.filter(
          (conn) =>
            groupServiceIds.has(conn.sourceId) &&
            groupServiceIds.has(conn.targetId)
        );

        const servicePositions = calculateServicePositions(
          servicesInGroup,
          groupConnections
        );

        const groupSize = calculateGroupSizeFromServicePositions(
          servicesInGroup,
          servicePositions
        );

        return {
          group,
          servicesInGroup,
          servicePositions,
          groupSize,
          savedPosition: archData.positions.get(group.id) || null,
        };
      });

      const autoEntries = preparedGroups.filter((entry) => !entry.savedPosition);
      const maxGroupsPerRow = Math.max(
        1,
        Math.ceil(Math.sqrt(autoEntries.length || 1))
      );
      const rows = [];
      autoEntries.forEach((entry, index) => {
        const rowIndex = Math.floor(index / maxGroupsPerRow);
        if (!rows[rowIndex]) rows[rowIndex] = [];
        rows[rowIndex].push(entry);
      });

      const maxRowWidth = rows.reduce((max, row) => {
        if (!row || row.length === 0) return max;
        const width = row.reduce(
          (sum, entry, idx) =>
            sum +
            entry.groupSize.width +
            (idx > 0 ? groupHorizontalSpacing : 0),
          0
        );
        return Math.max(max, width);
      }, 0);

      let currentY = layoutPadding.y;
      rows.forEach((row) => {
        if (!row || row.length === 0) return;
        const rowHeight = row.reduce(
          (max, entry) => Math.max(max, entry.groupSize.height),
          0
        );
        const rowWidth = row.reduce(
          (sum, entry, idx) =>
            sum +
            entry.groupSize.width +
            (idx > 0 ? groupHorizontalSpacing : 0),
          0
        );
        const startX =
          layoutPadding.x +
          (maxRowWidth > 0 ? (maxRowWidth - rowWidth) / 2 : 0);
        let currentX = startX;
        row.forEach((entry) => {
          entry.position = { x: currentX, y: currentY };
          currentX += entry.groupSize.width + groupHorizontalSpacing;
        });
        currentY += rowHeight + groupVerticalSpacing;
      });

      preparedGroups.forEach((entry) => {
        if (entry.savedPosition) {
          entry.position = entry.savedPosition;
        }

        const adjustedServicePositions = adjustServicePositionsToGroup(
          entry.servicesInGroup,
          entry.servicePositions,
          entry.position,
          entry.groupSize
        );

        const groupNode = {
          id: entry.group.id,
          type: "group",
          position: entry.position || { x: layoutPadding.x, y: layoutPadding.y },
          data: {
            nodeType: "group",
            groupData: entry.group,
            customStyle: archData.nodeStyles.get(entry.group.id) || undefined,
          },
          style: entry.groupSize,
          draggable: true,
          selectable: true,
          width: entry.groupSize.width,
          height: entry.groupSize.height,
        };

        nodes.push(groupNode);
        allNodesMap.set(entry.group.id, groupNode);

        entry.servicesInGroup.forEach((service) => {
          const savedPosition = archData.positions.get(service.id);
          const position =
            savedPosition ||
            adjustedServicePositions.get(service.id) || {
              x: 100,
              y: 100,
            };

          const serviceNode = {
            id: service.id,
            type: "service",
            position,
            data: {
              nodeType: "service",
              serviceData: service,
              customStyle: archData.nodeStyles.get(service.id) || undefined,
            },
            draggable: true,
            parentNode: entry.group.id,
            extent: "parent",
          };

          nodes.push(serviceNode);
          allNodesMap.set(service.id, serviceNode);
        });
      });

      const standaloneServices = Array.from(archData.services.values()).filter(
        (s) => !s.group
      );

      if (standaloneServices.length > 0) {
        const standaloneWidth = 180;
        const standaloneHeight = 100;
        const standaloneSpacing = 50;

        standaloneServices.forEach((service, index) => {
          const savedPosition = archData.positions.get(service.id);
          const position = savedPosition || {
            x: currentGroupX + (index % 3) * (standaloneWidth + standaloneSpacing),
            y: groupY + 500 + Math.floor(index / 3) * (standaloneHeight + standaloneSpacing)
          };

          const serviceNode = {
            id: service.id,
            type: "service",
            position,
            data: {
              nodeType: "service",
              serviceData: service,
              customStyle: archData.nodeStyles.get(service.id) || undefined,
            },
            draggable: true,
          };

          nodes.push(serviceNode);
          allNodesMap.set(service.id, serviceNode);
        });
      }

      archData.connections.forEach((conn, index) => {
        const sourceNode = allNodesMap.get(conn.sourceId);
        const targetNode = allNodesMap.get(conn.targetId);

        if (sourceNode && targetNode) {
          const sourceHandle = CHAR_TO_HANDLE[conn.sourceSide] || "right";
          const targetHandle = CHAR_TO_HANDLE[conn.targetSide] || "left";
          const edgeKey = `${conn.sourceId}:${conn.sourceSide} -- ${conn.targetSide}:${conn.targetId}`;
          const styleConf = archData.edgeStyles.get(edgeKey);
          const allowedTypes = new Set(["custom", "straight", "step", "smoothstep", "bezier"]);
          const resolvedType = styleConf?.type && allowedTypes.has(styleConf.type.toLowerCase())
            ? (styleConf.type.toLowerCase() === "bezier" ? "custom" : styleConf.type.toLowerCase())
            : "custom";
          const edge = {
            id: `edge-${conn.sourceId}-${conn.targetId}-${index}`,
            source: conn.sourceId,
            target: conn.targetId,
            sourceHandle: sourceHandle,
            targetHandle: targetHandle,
            type: resolvedType,
            style: {
              stroke: styleConf?.stroke || "#000000",
              strokeWidth: 2,
              strokeDasharray: styleConf?.dash || undefined,
            },
            markerEnd:
              styleConf?.arrow && styleConf.arrow.toLowerCase() !== "none"
                ? {
                  type:
                    styleConf.arrow.toLowerCase() === "closed"
                      ? MarkerType.ArrowClosed
                      : MarkerType.Arrow,
                  color: styleConf?.stroke || "#000000",
                }
                : undefined,
            interactionWidth: 30,
            selectable: true,
            updatable: true,
          };

          edges.push(edge);
        }
      });

      console.log('Final nodes:', nodes);
      return { nodes, edges };
    },
    [calculateServicePositions, calculateGroupSizeFromServicePositions, adjustServicePositionsToGroup]
  );

  const saveNodePositionsToCode = useCallback(
    (updatedNodes) => {
      if (isSaving) return;

      setIsSaving(true);

      setTimeout(() => {
        try {
          const currentCode = codeRef.current;
          const lines = currentCode.split("\n");
          const newLines = lines.filter(
            (line) => !line.trim().startsWith("%% Position:")
          );

          updatedNodes.forEach((node) => {
            if (
              node.type === "service" &&
              node.parentNode &&
              isFinite(node.position.x) &&
              isFinite(node.position.y)
            ) {
              newLines.push(
                `%% Position: ${node.id} = [${Math.round(node.position.x)}, ${Math.round(node.position.y)}]`
              );
            } else if (isFinite(node.position.x) && isFinite(node.position.y)) {
              newLines.push(
                `%% Position: ${node.id} = [${Math.round(node.position.x)}, ${Math.round(node.position.y)}]`
              );
            }
          });

          const updatedCode = newLines.join("\n");
          commitCodeUpdate(updatedCode);
          setStatusMessage("Positions saved");

          setPreventRerender(true);
          setTimeout(() => {
            setPreventRerender(false);
            setIsSaving(false);
          }, 1000);

        } catch (error) {
          console.error("Error saving positions:", error);
          setIsSaving(false);
        }
      }, 500);
    },
    [commitCodeUpdate, isSaving]
  );

  const detachServiceNode = useCallback(
    (serviceId) => {
      if (!serviceId) return;
      setNodes((currentNodes) => {
        const serviceNode = currentNodes.find((node) => node.id === serviceId);
        if (!serviceNode || !serviceNode.parentNode) return currentNodes;

        const absolutePosition = getAbsoluteNodePosition(
          serviceNode,
          currentNodes
        );

        const updatedNodes = currentNodes.map((node) =>
          node.id === serviceId
            ? {
                ...node,
                parentNode: undefined,
                extent: undefined,
                position: absolutePosition,
                data: {
                  ...node.data,
                  serviceData: {
                    ...node.data.serviceData,
                    group: null,
                  },
                },
              }
            : node
        );

        setTimeout(() => {
          saveNodePositionsToCode(updatedNodes);
        }, 0);

        return updatedNodes;
      });

      setHoveredGroupId(null);
      updateServiceGroupInCode(serviceId, null);
      setStatusMessage(`Detached ${serviceId}`);
      setTimeout(() => setStatusMessage(""), 2000);
    },
    [
      getAbsoluteNodePosition,
      saveNodePositionsToCode,
      updateServiceGroupInCode,
      setNodes,
      setStatusMessage,
      setHoveredGroupId,
    ]
  );

  const onNodeDrag = useCallback(
    (event, node) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id ? { ...n, position: node.position } : n
        )
      );

      if (node.type === "service") {
        const serviceSize = getNodeDimensions(node.id, SERVICE_NODE_SIZE);
        const absolutePosition = node.positionAbsolute || node.position;
        const absoluteCenter = {
          x: absolutePosition.x + serviceSize.width / 2,
          y: absolutePosition.y + serviceSize.height / 2,
        };
        const containingGroup = findContainingGroup(
          absoluteCenter,
          null,
          nodesRef.current
        );
        setHoveredGroupId(containingGroup ? containingGroup.id : null);
      } else {
        setHoveredGroupId(null);
      }
    },
    [setNodes, getNodeDimensions, findContainingGroup]
  );

  const onNodeDragStop = useCallback(
    (event, node) => {
      setNodes((currentNodes) => {
        let updatedNodes = currentNodes.map((n) =>
          n.id === node.id ? { ...n, position: node.position } : n
        );

        const draggedNode = updatedNodes.find((n) => n.id === node.id);

        if (draggedNode && draggedNode.type === "service") {
          const serviceSize = getNodeDimensions(node.id, SERVICE_NODE_SIZE);
          const absolutePosition = getAbsoluteNodePosition(
            { ...draggedNode, position: node.position },
            updatedNodes
          );
          const absoluteCenter = {
            x: absolutePosition.x + serviceSize.width / 2,
            y: absolutePosition.y + serviceSize.height / 2,
          };

          const containingGroup = findContainingGroup(
            absoluteCenter,
            null,
            updatedNodes
          );

          if (containingGroup) {
            const groupAbsolute = getAbsoluteNodePosition(
              containingGroup,
              updatedNodes
            );
            const relativePosition = {
              x: absolutePosition.x - groupAbsolute.x,
              y: absolutePosition.y - groupAbsolute.y,
            };
            const clamped = clampRelativePositionToGroup(
              relativePosition,
              containingGroup,
              serviceSize
            );

            if (draggedNode.parentNode !== containingGroup.id) {
              updateServiceGroupInCode(draggedNode.id, containingGroup.id);
            }

            updatedNodes = updatedNodes.map((n) =>
              n.id === draggedNode.id
                ? {
                    ...n,
                    parentNode: containingGroup.id,
                    extent: "parent",
                    position: clamped,
                    data: {
                      ...n.data,
                      serviceData: {
                        ...n.data.serviceData,
                        group: containingGroup.id,
                      },
                    },
                  }
                : n
            );
          } else if (draggedNode.parentNode) {
            updateServiceGroupInCode(draggedNode.id, null);
            updatedNodes = updatedNodes.map((n) =>
              n.id === draggedNode.id
                ? {
                    ...n,
                    parentNode: undefined,
                    extent: undefined,
                    position: absolutePosition,
                    data: {
                      ...n.data,
                      serviceData: {
                        ...n.data.serviceData,
                        group: null,
                      },
                    },
                  }
                : n
            );
          }
        }

        setTimeout(() => {
          saveNodePositionsToCode(updatedNodes);
        }, 100);

        return updatedNodes;
      });
      setHoveredGroupId(null);
    },
    [
      saveNodePositionsToCode,
      setNodes,
      getNodeDimensions,
      getAbsoluteNodePosition,
      findContainingGroup,
      clampRelativePositionToGroup,
      updateServiceGroupInCode,
      setHoveredGroupId,
    ]
  );

  const addNewGroup = useCallback(
    (position = { x: 100, y: 100 }) => {
      setPreventRerender(true);

      const groupId = `group_${Date.now()}`;
      const currentCode = codeRef.current;

      const newCode = currentCode.includes("architecture-beta")
        ? currentCode +
        `\ngroup ${groupId}(cloud)[New Group]\n%% Position: ${groupId} = [${Math.round(
          position.x
        )}, ${Math.round(position.y)}]`
        : `architecture-beta\ngroup ${groupId}(cloud)[New Group]\n%% Position: ${groupId} = [${Math.round(
          position.x
        )}, ${Math.round(position.y)}]`;

      commitCodeUpdate(newCode);

      const newGroupNode = {
        id: groupId,
        type: "group",
        position,
        data: {
          nodeType: "group",
          groupData: { id: groupId, type: "cloud", label: "New Group" },
        },
        style: { width: 600, height: 400 },
      };

      setNodes((currentNodes) => [...currentNodes, newGroupNode]);
      setStatusMessage(`Added new group: ${groupId}`);
      setTimeout(() => setStatusMessage(""), 3000);

      setTimeout(() => setPreventRerender(false), 100);
    },
    [commitCodeUpdate, setNodes]
  );

  const addNewService = useCallback(
    (groupId = null, position = null) => {
      const serviceId = `service_${Date.now()}`;
      const currentCode = codeRef.current;

      let serviceLine;
      let finalPosition;

      if (groupId) {
        serviceLine = `service ${serviceId}(server)[New Service] in ${groupId}`;
        const groupNode = nodes.find((n) => n.id === groupId);

        if (groupNode) {
          const servicesInGroup = nodes.filter(
            (n) => n.type === "service" && n.parentNode === groupId
          );

          const serviceWidth = 180;
          const serviceHeight = 100;
          const horizontalSpacing = 50;
          const verticalSpacing = 80;
          const horizontalMargin = 50;
          const verticalMargin = 50;

          const servicesPerRow = Math.max(
            2,
            Math.floor(
              ((groupNode.style?.width || 600) - horizontalMargin * 2) /
              (serviceWidth + horizontalSpacing)
            )
          );
          const row = Math.floor(servicesInGroup.length / servicesPerRow);
          const col = servicesInGroup.length % servicesPerRow;

          finalPosition = {
            x: horizontalMargin + col * (serviceWidth + horizontalSpacing),
            y: verticalMargin + row * (serviceHeight + verticalSpacing),
          };

          console.log("Service position in group:", {
            groupPosition: groupNode.position,
            relativePosition: finalPosition,
            absolutePosition: {
              x: groupNode.position.x + finalPosition.x,
              y: groupNode.position.y + finalPosition.y,
            },
            servicesInGroup: servicesInGroup.length,
            row,
            col,
          });
        } else {
          finalPosition = { x: 100, y: 100 };
        }
      } else {
        serviceLine = `service ${serviceId}(server)[New Service]`;

        if (reactFlow) {
          const viewport = reactFlow.getViewport?.();
          const centerX =
            -viewport?.x + window.innerWidth / 2 / (viewport?.zoom || 1) - 90;
          const centerY =
            -viewport?.y + window.innerHeight / 2 / (viewport?.zoom || 1) - 50;
          finalPosition = { x: centerX, y: centerY };
        } else {
          finalPosition = { x: 500, y: 300 };
        }
      }

      if (position && isFinite(position.x) && isFinite(position.y)) {
        finalPosition = position;
      }

      const newCode = currentCode.includes("architecture-beta")
        ? currentCode +
        `\n${serviceLine}\n%% Position: ${serviceId} = [${Math.round(
          finalPosition.x
        )}, ${Math.round(finalPosition.y)}]`
        : `architecture-beta\n${serviceLine}\n%% Position: ${serviceId} = [${Math.round(
          finalPosition.x
        )}, ${Math.round(finalPosition.y)}]`;

      commitCodeUpdate(newCode);

      const newServiceNode = {
        id: serviceId,
        type: "service",
        position: finalPosition,
        data: {
          nodeType: "service",
          serviceData: {
            id: serviceId,
            type: "server",
            label: "New Service",
            group: groupId,
          },
        },
        draggable: true,
        parentNode: groupId || undefined,
        extent: groupId ? "parent" : undefined,
      };

      setNodes((currentNodes) => [...currentNodes, newServiceNode]);
      setStatusMessage(`Added new service${groupId ? ` to ${groupId}` : ""}`);
      setTimeout(() => setStatusMessage(""), 3000);
    },
    [commitCodeUpdate, nodes, reactFlow, setNodes]
  );

  const deleteNode = useCallback(() => {
    if (!selectedNode) return;

    setPreventRerender(true);

    const currentCode = codeRef.current;
    const lines = currentCode.split("\n");
    const newLines = [];
    const nodeId = selectedNode.id;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line.startsWith(`group ${nodeId}`) ||
        line.startsWith(`service ${nodeId}`) ||
        line.startsWith(`%% Position: ${nodeId}`) ||
        line.startsWith(`%% NodeStyle: ${nodeId}`) ||
        line.includes(`${nodeId}:`) ||
        line.includes(`:${nodeId}`)
      ) {
        continue;
      }
      newLines.push(lines[i]);
    }

    commitCodeUpdate(newLines.join("\n"));

    setNodes((currentNodes) =>
      currentNodes.filter((node) => node.id !== nodeId)
    );
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      )
    );

    setSelectedNode(null);
    setStatusMessage(`Deleted ${selectedNode.data.nodeType}: ${nodeId}`);
    setTimeout(() => setStatusMessage(""), 3000);

    setTimeout(() => setPreventRerender(false), 100);
  }, [selectedNode, commitCodeUpdate, setNodes, setEdges]);

  const updateNode = useCallback(
    (nodeId, newData, nodeType) => {
      console.log("Updating node:", { nodeId, newData, nodeType });
      setPreventRerender(true);

      const currentCode = codeRef.current;
      console.log("Current code before update:", currentCode);

      const lines = currentCode.split("\n");
      const newLines = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (nodeType === "group" && line.startsWith(`group ${nodeId}`)) {
          console.log("Found group to update:", line);
          newLines.push(`group ${nodeId}(${newData.type})[${newData.label}]`);
          console.log(
            "Updated group to:",
            `group ${nodeId}(${newData.type})[${newData.label}]`
          );
        } else if (
          nodeType === "service" &&
          line.startsWith(`service ${nodeId}`)
        ) {
          console.log("Found service to update:", line);
          const inGroupMatch = line.match(/\s+in\s+(\w+)$/);
          const groupPart = inGroupMatch ? ` in ${inGroupMatch[1]}` : "";
          const updatedServiceLine = `service ${nodeId}(${newData.type})[${newData.label}]${groupPart}`;
          newLines.push(updatedServiceLine);
          console.log("Updated service to:", updatedServiceLine);
        } else if (line.startsWith(`%% NodeStyle: ${nodeId}`)) {
          // skip old node style line; we'll append a new one below if needed
          continue;
        } else {
          newLines.push(lines[i]);
        }
      }

      // Optionally append NodeStyle
      const styleParts = [];
      if (newData.outlineColor) styleParts.push(`outline:${newData.outlineColor}`);
      if (newData.backgroundColor)
        styleParts.push(`bg:${newData.backgroundColor}`);
      if (newData.borderStyle)
        styleParts.push(`borderStyle:${newData.borderStyle}`);
      if (styleParts.length) {
        newLines.push(`%% NodeStyle: ${nodeId} = ${styleParts.join("; ")}`);
      }

      const updatedCode = newLines.join("\n");
      console.log("Code after update:", updatedCode);

      commitCodeUpdate(updatedCode);

      setNodes((currentNodes) => {
        const updatedNodes = currentNodes.map((node) => {
          if (node.id === nodeId) {
            if (node.data.nodeType === "group") {
              return {
                ...node,
                data: {
                  ...node.data,
                  groupData: {
                    ...node.data.groupData,
                    label: newData.label,
                    type: newData.type,
                  },
                  customStyle: {
                    ...(node.data.customStyle || {}),
                    outlineColor: newData.outlineColor || (node.data.customStyle || {}).outlineColor,
                    backgroundColor:
                      newData.backgroundColor || (node.data.customStyle || {}).backgroundColor,
                    borderStyle:
                      newData.borderStyle || (node.data.customStyle || {}).borderStyle,
                  },
                },
              };
            } else if (node.data.nodeType === "service") {
              return {
                ...node,
                data: {
                  ...node.data,
                  serviceData: {
                    ...node.data.serviceData,
                    label: newData.label,
                    type: newData.type,
                  },
                  customStyle: {
                    ...(node.data.customStyle || {}),
                    outlineColor: newData.outlineColor || (node.data.customStyle || {}).outlineColor,
                    backgroundColor:
                      newData.backgroundColor || (node.data.customStyle || {}).backgroundColor,
                    borderStyle:
                      newData.borderStyle || (node.data.customStyle || {}).borderStyle,
                  },
                },
              };
            }
          }
          return node;
        });
        console.log("Nodes after update:", updatedNodes);
        return updatedNodes;
      });

      setShowEditPanel(false);
      setStatusMessage(`Updated ${nodeType}: ${nodeId}`);

      setTimeout(() => {
        console.log("Re-enabling re-renders");
        setPreventRerender(false);
      }, 2000);

      setTimeout(() => setStatusMessage(""), 3000);
    },
    [commitCodeUpdate, setNodes]
  );

  const handleRealTimeUpdate = useCallback(
    (nodeId, formData) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            if (node.data.nodeType === "group") {
              return {
                ...node,
                data: {
                  ...node.data,
                  groupData: { ...node.data.groupData, ...formData },
                  customStyle: {
                    ...(node.data.customStyle || {}),
                    outlineColor:
                      formData.outlineColor !== undefined
                        ? formData.outlineColor
                        : (node.data.customStyle || {}).outlineColor,
                    backgroundColor:
                      formData.backgroundColor !== undefined
                        ? formData.backgroundColor
                        : (node.data.customStyle || {}).backgroundColor,
                    borderStyle:
                      formData.borderStyle !== undefined
                        ? formData.borderStyle
                        : (node.data.customStyle || {}).borderStyle,
                  },
                },
                style: node.style,
              };
            } else if (node.data.nodeType === "service") {
              return {
                ...node,
                data: {
                  ...node.data,
                  serviceData: { ...node.data.serviceData, ...formData },
                  customStyle: {
                    ...(node.data.customStyle || {}),
                    outlineColor:
                      formData.outlineColor !== undefined
                        ? formData.outlineColor
                        : (node.data.customStyle || {}).outlineColor,
                    backgroundColor:
                      formData.backgroundColor !== undefined
                        ? formData.backgroundColor
                        : (node.data.customStyle || {}).backgroundColor,
                    borderStyle:
                      formData.borderStyle !== undefined
                        ? formData.borderStyle
                        : (node.data.customStyle || {}).borderStyle,
                  },
                },
                position: node.position,
              };
            }
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  const onNodeClick = useCallback(
    (event, node) => {
      setSelectedEdge(null);
      setSelectedNode(node);
    },
    []
  );

  const onPaneClick = useCallback(
    (event) => {
      if (event.detail === 2 && reactFlow) {
        const position = reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addNewGroup(position);
      }
      setSelectedNode(null);
      setSelectedEdge(null);
    },
    [reactFlow, addNewGroup]
  );

  const onConnect = useCallback(
    (params) => {
      setPreventRerender(true);

      const sourceHandle = params.sourceHandle || "right";
      const targetHandle = params.targetHandle || "left";

      const connectionLine = buildConnectionLine({
        source: params.source,
        target: params.target,
        sourceHandle,
        targetHandle,
      });
      const updatedCode = codeRef.current + "\n" + connectionLine;
      commitCodeUpdate(updatedCode);

      const newEdge = {
        id: `edge-${params.source}-${params.target}-${Date.now()}`,
        source: params.source,
        target: params.target,
        sourceHandle,
        targetHandle,
        type: "custom",
        style: { stroke: "#000000", strokeWidth: 2 },
        markerEnd: undefined,
        selectable: true,
        updatable: true,
        interactionWidth: 30,
      };

      setEdges((currentEdges) => [...currentEdges, newEdge]);
      setStatusMessage(`Connected ${params.source} to ${params.target}`);
      setTimeout(() => setStatusMessage(""), 3000);

      setTimeout(() => setPreventRerender(false), 100);
    },
    [commitCodeUpdate, setEdges]
  );

  useEffect(() => {
    if (code && typeof window !== "undefined" && !preventRerender) {
      console.log("Initializing diagram from code...");
      const initializeDiagram = () => {
        try {
          const archData = parseArchitectureCode(code);
          const { nodes: flowNodes, edges: flowEdges } =
            createFlowElements(archData);

          setNodes(flowNodes);
          setEdges(flowEdges);
          setSvg(null);
        } catch (error) {
          console.error("Error initializing diagram:", error);
        }
      };

      initializeDiagram();
    }
  }, [
    code,
    parseArchitectureCode,
    createFlowElements,
    setNodes,
    setEdges,
    setSvg,
    preventRerender,
  ]);

  useEffect(() => {
    const hasInvalidPositions = nodes.some(
      (node) =>
        !node.position ||
        !isFinite(node.position.x) ||
        !isFinite(node.position.y)
    );

    if (hasInvalidPositions) {
      console.warn("Found nodes with invalid positions, resetting...");
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (
            !node.position ||
            !isFinite(node.position.x) ||
            !isFinite(node.position.y)
          ) {
            return {
              ...node,
              position: { x: 100, y: 100 },
            };
          }
          return node;
        })
      );
    }
  }, [nodes, setNodes]);

  useEffect(() => {
    if (selectedEdge && !edges.some((edge) => edge.id === selectedEdge.id)) {
      setSelectedEdge(null);
    }
  }, [edges, selectedEdge, setSelectedEdge]);

  useEffect(() => {
    const hasUndraggableNodes = nodes.some(
      (node) => node.draggable === undefined || node.draggable === false
    );
    if (hasUndraggableNodes) {
      console.log("Fixing undraggable nodes...");
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          draggable: true,
          selectable: true,
        }))
      );
    }
  }, [nodes, setNodes]);

  return (
    <Box
      ref={chartRef}
      sx={{
        height: "100vh",
        position: "relative",
        background: "#ffffff",
      }}
    >
      <StatusDisplay message={statusMessage} />

      {showEditPanel && selectedNode && (
        <EditPanel
          selectedNode={selectedNode}
          onSave={updateNode}
          onUpdate={handleRealTimeUpdate}
          onClose={() => setShowEditPanel(false)}
        />
      )}

      {selectedNode && !showEditPanel && (
        <Box
          sx={{
            position: "absolute",
            top: 20,
            left: 20,
            zIndex: 1000,
            display: "flex",
            gap: 1,
            background: "white",
            padding: "8px",
            borderRadius: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => setShowEditPanel(true)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={deleteNode}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {selectedNode.data.nodeType === "group" && (
            <Tooltip title="Add Service to Group">
              <IconButton
                size="small"
                onClick={() => addNewService(selectedNode.id)}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {selectedEdge && (
        <Box
          sx={{
            position: "absolute",
            top: 100,
            left: 20,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: 1,
            background: "white",
            padding: "8px 12px",
            borderRadius: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            border: "1px solid #000000",
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontSize: "12px", fontWeight: 600, color: "#000000" }}
          >
            {selectedEdge.source} → {selectedEdge.target}
          </Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="edge-type-label">Line</InputLabel>
            <Select
              labelId="edge-type-label"
              label="Line"
              value={
                selectedEdge?.type && selectedEdge.type !== "custom"
                  ? selectedEdge.type
                  : "bezier"
              }
              onChange={(e) => {
                const val = e.target.value;
                const mappedType = val === "bezier" ? "custom" : val;
                setEdges((eds) =>
                  eds.map((ed) =>
                    ed.id === selectedEdge.id ? { ...ed, type: mappedType } : ed
                  )
                );
                const updated = { ...selectedEdge, type: mappedType };
                setSelectedEdge(updated);
                upsertEdgeStyleInCode(updated);
              }}
            >
              <MenuItem value="bezier">Bezier</MenuItem>
              <MenuItem value="straight">Straight</MenuItem>
              <MenuItem value="step">Step</MenuItem>
              <MenuItem value="smoothstep">Smooth Step</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="edge-color-label">Color</InputLabel>
            <Select
              labelId="edge-color-label"
              label="Color"
              value={selectedEdge?.style?.stroke || "#000000"}
              onChange={(e) => {
                const stroke = e.target.value;
                setEdges((eds) =>
                  eds.map((ed) =>
                    ed.id === selectedEdge.id
                      ? {
                        ...ed,
                        style: { ...ed.style, stroke },
                        markerEnd: ed.markerEnd
                          ? { ...ed.markerEnd, color: stroke }
                          : undefined,
                      }
                      : ed
                  )
                );
                const updated = {
                  ...selectedEdge,
                  style: { ...(selectedEdge.style || {}), stroke },
                  markerEnd: selectedEdge.markerEnd
                    ? { ...selectedEdge.markerEnd, color: stroke }
                    : undefined,
                };
                setSelectedEdge(updated);
                upsertEdgeStyleInCode(updated);
              }}
            >
              {[
                "#000000",
                "#d32f2f",
                "#1976d2",
                "#2e7d32",
                "#ed6c02",
                "#6a1b9a",
                "#455a64",
              ].map((c) => (
                <MenuItem key={c} value={c}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ width: 14, height: 14, bgcolor: c, border: '1px solid #000', borderRadius: '2px' }} />
                    <Typography sx={{ fontSize: 12 }}>{c}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="edge-dash-label">Dash</InputLabel>
            <Select
              labelId="edge-dash-label"
              label="Dash"
              value={selectedEdge?.style?.strokeDasharray || "none"}
              onChange={(e) => {
                const v = e.target.value;
                const dash = v === "none" ? undefined : v;
                setEdges((eds) =>
                  eds.map((ed) =>
                    ed.id === selectedEdge.id
                      ? { ...ed, style: { ...ed.style, strokeDasharray: dash } }
                      : ed
                  )
                );
                const updated = {
                  ...selectedEdge,
                  style: { ...(selectedEdge.style || {}), strokeDasharray: dash },
                };
                setSelectedEdge(updated);
                upsertEdgeStyleInCode(updated);
              }}
            >
              <MenuItem value="none">Solid</MenuItem>
              <MenuItem value="4,2">Dash 4-2</MenuItem>
              <MenuItem value="6,2">Dash 6-2</MenuItem>
              <MenuItem value="8,4">Dash 8-4</MenuItem>
              <MenuItem value="2,2">Dot 2-2</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="arrow-type-label">Arrow</InputLabel>
            <Select
              labelId="arrow-type-label"
              label="Arrow"
              value={
                selectedEdge?.markerEnd?.type === MarkerType.ArrowClosed
                  ? "closed"
                  : selectedEdge?.markerEnd?.type === MarkerType.Arrow
                    ? "open"
                    : "none"
              }
              onChange={(e) => {
                const val = e.target.value;
                const markerEnd =
                  val === "none"
                    ? undefined
                    : {
                      type:
                        val === "closed" ? MarkerType.ArrowClosed : MarkerType.Arrow,
                      color: selectedEdge?.style?.stroke || "#000000",
                    };
                setEdges((eds) =>
                  eds.map((ed) => (ed.id === selectedEdge.id ? { ...ed, markerEnd } : ed))
                );
                const updated = { ...selectedEdge, markerEnd };
                setSelectedEdge(updated);
                upsertEdgeStyleInCode(updated);
              }}
              sx={{ minWidth: 100 }}
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Delete Connection">
            <IconButton
              size="small"
              onClick={() => handleDeleteEdge(selectedEdge.id)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton size="small" onClick={() => setSelectedEdge(null)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <Box
        sx={{
          position: "absolute",
          top: 20,
          right: 20,
          zIndex: 1000,
          display: "flex",
          gap: 1,
          background: "white",
          padding: "8px",
          borderRadius: "4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => addNewGroup()}
          sx={{
            backgroundColor: "#000000",
            color: "#ffffff",
            fontSize: "11px",
            "&:hover": {
              backgroundColor: "#333333",
            },
          }}
        >
          Add Group
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => addNewService()}
          sx={{
            borderColor: "#000000",
            color: "#000000",
            fontSize: "11px",
            "&:hover": {
              borderColor: "#333333",
              backgroundColor: "rgba(0,0,0,0.04)",
            },
          }}
        >
          Add Service
        </Button>
      </Box>

      <NodeActionsContext.Provider value={{ detachService: detachServiceNode }}>
        <GroupHoverContext.Provider value={{ hoveredGroupId }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeClick={onNodeClick}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={onPaneClick}
          onConnect={onConnect}
          onEdgeClick={handleEdgeClick}
          onEdgeUpdate={handleEdgeUpdate}
          onEdgeUpdateStart={handleEdgeUpdateStart}
          onEdgeUpdateEnd={handleEdgeUpdateEnd}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{
            padding: 0.2,
            includeHiddenNodes: false,
            minZoom: 0.1,
            maxZoom: 2,
          }}
          minZoom={0.05}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={true}
          nodesConnectable={true}
          elementsSelectable={true}
          edgesUpdatable={true}
          selectNodesOnDrag={false}
          defaultEdgeOptions={{
            type: "custom",
            style: {
              stroke: "#000000",
              strokeWidth: 2,
            },
            markerEnd: undefined,
          }}
          connectionLineType={ConnectionLineType.SimpleBezier}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={30}
          connectionLineStyle={{
            stroke: "#000000",
            strokeWidth: 2,
          }}
          nodeOrigin={[0, 0]}
          edgeUpdaterRadius={10}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background color="#f0f0f0" gap={25} size={1} />
            <Controls
              showFitView={true}
              showInteractive={true}
              style={{
                position: "absolute",
                top: "80%",
                left: "10px",
                transform: "translateY(-50%)",
                zIndex: 1001,
              }}
            />
          </ReactFlow>
        </GroupHoverContext.Provider>
      </NodeActionsContext.Provider>
    </Box>
  );
};

const ArchitectureDiagramWrapper = (props) => (
  <ReactFlowProvider>
    <ArchitectureDiagramView {...props} />
  </ReactFlowProvider>
);

export default ArchitectureDiagramWrapper;
