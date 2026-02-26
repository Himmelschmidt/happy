import * as React from 'react';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { readAsStringAsync } from 'expo-file-system';

/**
 * Picked image ready for message attachment.
 * Contains JPEG base64 data resized to max 1024px on longest side.
 */
export type PickedImage = {
    mediaType: 'image/jpeg';
    base64: string;
};

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;
const MAX_IMAGES = 4;

/**
 * useImagePicker - Picks and resizes images for message attachments.
 *
 * 1. Requests permissions via expo-image-picker
 * 2. Launches picker (library or camera)
 * 3. Resizes to max 1024px via expo-image-manipulator
 * 4. Converts to JPEG base64 at 0.8 quality
 * 5. Returns { pickFromLibrary, pickFromCamera } functions
 */
export function useImagePicker() {

    const processAsset = React.useCallback(async (asset: ImagePicker.ImagePickerAsset): Promise<PickedImage | null> => {
        const { uri, width, height } = asset;

        // Calculate resize dimensions to fit within MAX_DIMENSION on longest side
        const actions: { resize: { width?: number; height?: number } }[] = [];
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width >= height) {
                actions.push({ resize: { width: MAX_DIMENSION } });
            } else {
                actions.push({ resize: { height: MAX_DIMENSION } });
            }
        }

        const result = await manipulateAsync(uri, actions, {
            compress: JPEG_QUALITY,
            format: SaveFormat.JPEG,
            base64: true,
        });

        if (!result.base64) {
            // Fallback: read file as base64
            const fileBase64 = await readAsStringAsync(result.uri, {
                encoding: 'base64',
            });
            return { mediaType: 'image/jpeg', base64: fileBase64 };
        }

        return { mediaType: 'image/jpeg', base64: result.base64 };
    }, []);

    const pickFromLibrary = React.useCallback(async (): Promise<PickedImage[]> => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            return [];
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: MAX_IMAGES,
            quality: 1,
        });

        if (result.canceled || !result.assets?.length) {
            return [];
        }

        const images: PickedImage[] = [];
        for (const asset of result.assets.slice(0, MAX_IMAGES)) {
            const processed = await processAsset(asset);
            if (processed) {
                images.push(processed);
            }
        }
        return images;
    }, [processAsset]);

    const pickFromCamera = React.useCallback(async (): Promise<PickedImage[]> => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            return [];
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 1,
        });

        if (result.canceled || !result.assets?.length) {
            return [];
        }

        const processed = await processAsset(result.assets[0]);
        return processed ? [processed] : [];
    }, [processAsset]);

    return { pickFromLibrary, pickFromCamera };
}
