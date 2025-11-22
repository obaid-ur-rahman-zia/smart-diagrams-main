"use client";

import MonacoEditor from "@monaco-editor/react";
import initEditor from "monaco-mermaid";
import { useStore } from "@/store";
import { useState, useEffect } from "react";
import { Box, Button, CircularProgress } from "@mui/material";
import axiosInstance from "@/utils/axiosInstance";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";

const MermaidEditor = () => {
    const code = useStore((state) => state.code);
    const setCode = useStore((state) => state.setCode);
    const config = useStore((state) => state.config);
    const setConfig = useStore((state) => state.setConfig);
    const editorMode = useStore((state) => state.editorMode);

    const [isModified, setIsModified] = useState(false);
    const { id } = useParams();
    const [loading, setLoading] = useState(true);

    // Function to fetch data from database
    const fetchData = async () => {
        try {
            const response = await axiosInstance.get(`/api/flowchart/${id}`);
            const freshCode = response.data.data.mermaidString;
            
            console.log('=== LOADING FROM DATABASE ===');
            console.log('Loaded code:', freshCode.substring(0, 100));
            
            // Set code directly from database - NO localStorage/sessionStorage
            setCode(freshCode);
            
        } catch (error) {
            console.error('Error fetching flowchart:', error);
            toast.error("Error loading diagram");
        } finally {
            setLoading(false);
        }
    };

    // Fetch data when component mounts or ID changes
    useEffect(() => {
        if (id && id !== "new") {
            console.log('Loading diagram for ID:', id);
            fetchData();
        } else {
            setLoading(false); // If new diagram, no need to load
        }
    }, [id]);

    // Handles changes in the editor - NO localStorage/sessionStorage
    const onChange = (value) => {
        if (editorMode === "code") {
            setCode(value);
            // REMOVED sessionStorage setting
        } else {
            setConfig(value);
        }
        setIsModified(true);
    };

    // Function to save to database
    const handleSave = async () => {
        try {
            const response = await axiosInstance.put(`/api/flowchart/${id}`, { 
                mermaidString: code 
            });
            
            if (response.status === 200) {
                setIsModified(false);
                toast.success(response.data.message);
                console.log('Diagram saved successfully');
            } else {
                toast.error("Something went wrong!");
            }
        } catch (error) {
            console.error("Error saving:", error);
            toast.error("Error occurred while saving");
        }
    };

    return (
        <Box sx={{ position: "relative", height: "100%" }}>
            {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                    <CircularProgress />
                </Box>
            ) : (
                <>
                    {id && id !== "new" && (
                        <Button
                            sx={{
                                zIndex: 999,
                                position: "absolute",
                                top: "80%",
                                right: "10%",
                                backgroundColor: "#FF3480",
                                color: "#fff",
                            }}
                            onClick={handleSave}
                        >
                            {isModified ? "Save Chart" : "Saved"}
                        </Button>
                    )}
                    <MonacoEditor
                        height="calc(100% - 50px)"
                        width="100%"
                        language="mermaid"
                        value={code}
                        onChange={onChange}
                        options={{ minimap: { enabled: false } }}
                        onMount={(editor, monaco) => {
                            try {
                                initEditor(monaco);
                            } catch (error) {
                                console.error("Error initializing Monaco editor:", error);
                            }
                        }}
                    />
                </>
            )}
        </Box>
    );
};

export default MermaidEditor;