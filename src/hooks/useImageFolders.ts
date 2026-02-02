import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ImageFolder } from "@/components/ImageFolderManager";

interface FolderAssignment {
  folder_id: string;
  file_path: string;
}

export function useImageFolders() {
  const [folders, setFolders] = useState<ImageFolder[]>([]);
  const [assignments, setAssignments] = useState<FolderAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load folders and assignments
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [foldersRes, assignmentsRes] = await Promise.all([
        supabase.from("image_folders").select("*").order("name"),
        supabase.from("image_folder_assignments").select("folder_id, file_path"),
      ]);

      if (foldersRes.error) throw foldersRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      setFolders(foldersRes.data || []);
      setAssignments(assignmentsRes.data || []);
    } catch (error) {
      console.error("Failed to load folder data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Assign an image to a folder
  const assignToFolder = useCallback(async (filePath: string, folderId: string) => {
    try {
      const { error } = await supabase
        .from("image_folder_assignments")
        .upsert({ file_path: filePath, folder_id: folderId });

      if (error) throw error;

      setAssignments((prev) => {
        // Remove any existing assignment for this file path
        const filtered = prev.filter((a) => a.file_path !== filePath);
        return [...filtered, { file_path: filePath, folder_id: folderId }];
      });

      return true;
    } catch (error) {
      console.error("Failed to assign to folder:", error);
      return false;
    }
  }, []);

  // Remove image from folder
  const removeFromFolder = useCallback(async (filePath: string) => {
    try {
      const { error } = await supabase
        .from("image_folder_assignments")
        .delete()
        .eq("file_path", filePath);

      if (error) throw error;

      setAssignments((prev) => prev.filter((a) => a.file_path !== filePath));
      return true;
    } catch (error) {
      console.error("Failed to remove from folder:", error);
      return false;
    }
  }, []);

  // Get folder ID for a file path
  const getFolderForImage = useCallback(
    (filePath: string): string | null => {
      const assignment = assignments.find((a) => a.file_path === filePath);
      return assignment?.folder_id || null;
    },
    [assignments]
  );

  // Get all file paths in a folder
  const getImagesInFolder = useCallback(
    (folderId: string): string[] => {
      return assignments
        .filter((a) => a.folder_id === folderId)
        .map((a) => a.file_path);
    },
    [assignments]
  );

  // Refresh data
  const refresh = useCallback(() => {
    setIsLoading(true);
    loadData();
  }, []);

  return {
    folders,
    assignments,
    isLoading,
    assignToFolder,
    removeFromFolder,
    getFolderForImage,
    getImagesInFolder,
    refresh,
  };
}
