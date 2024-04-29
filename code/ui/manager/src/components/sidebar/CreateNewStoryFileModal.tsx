import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { AlertIcon, CheckIcon } from '@storybook/icons';
import type {
  ArgTypesRequestPayload,
  ArgTypesResponsePayload,
  CreateNewStoryRequestPayload,
  CreateNewStoryResponsePayload,
  FileComponentSearchRequestPayload,
  FileComponentSearchResponsePayload,
  RequestData,
  ResponseData,
  SaveStoryRequestPayload,
  SaveStoryResponsePayload,
} from '@storybook/core-events';
import {
  ARGTYPES_INFO_REQUEST,
  ARGTYPES_INFO_RESPONSE,
  CREATE_NEW_STORYFILE_REQUEST,
  CREATE_NEW_STORYFILE_RESPONSE,
  FILE_COMPONENT_SEARCH_REQUEST,
  FILE_COMPONENT_SEARCH_RESPONSE,
  SAVE_STORY_REQUEST,
  SAVE_STORY_RESPONSE,
} from '@storybook/core-events';
import { addons, experimental_requestResponse, useStorybookApi } from '@storybook/manager-api';

import { useDebounce } from '../../hooks/useDebounce';
import type { NewStoryPayload, SearchResult } from './FileSearchList';
import { extractSeededRequiredArgs, trySelectNewStory } from './FileSearchModal.utils';
import { FileSearchModal } from './FileSearchModal';

interface CreateNewStoryFileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const stringifyArgs = (args: Record<string, any>) =>
  JSON.stringify(args, (_, value) => {
    if (typeof value === 'function') return '__sb_empty_function_arg__';
    return value;
  });

export const CreateNewStoryFileModal = ({ open, onOpenChange }: CreateNewStoryFileModalProps) => {
  const [isLoading, setLoading] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const fileSearchQueryDebounced = useDebounce(fileSearchQuery, 600);
  const fileSearchQueryDeferred = useDeferredValue(fileSearchQueryDebounced);
  const emittedValue = useRef<string | null>(null);
  const [error, setError] = useState<{ selectedItemId?: number | string; error: string } | null>(
    null
  );
  const api = useStorybookApi();

  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);

  const handleErrorWhenCreatingStory = useCallback(() => {
    api.addNotification({
      id: 'create-new-story-file-error',
      content: {
        headline: 'Error while creating story file',
        subHeadline: `Take a look at your developer console for more information`,
      },
      duration: 8_000,
      icon: <AlertIcon />,
    });

    onOpenChange(false);
  }, [api, onOpenChange]);

  const handleSuccessfullyCreatedStory = useCallback(
    (componentExportName: string) => {
      api.addNotification({
        id: 'create-new-story-file-success',
        content: {
          headline: 'Story file created',
          subHeadline: `${componentExportName} was created`,
        },
        duration: 8_000,
        icon: <CheckIcon />,
      });

      onOpenChange(false);
    },
    [api, onOpenChange]
  );

  const handleFileSearch = useCallback(() => {
    setLoading(true);
    const channel = addons.getChannel();

    const set = (data: ResponseData<FileComponentSearchResponsePayload>) => {
      const isLatestRequest = data.id === fileSearchQueryDeferred && data.payload.files;

      if (data.success) {
        if (isLatestRequest) {
          setSearchResults(data.payload.files);
        }
      } else {
        setError({ error: data.error });
      }

      if (isLatestRequest) {
        channel.off(FILE_COMPONENT_SEARCH_RESPONSE, set);
        setLoading(false);
        emittedValue.current = null;
      }
    };

    channel.on(FILE_COMPONENT_SEARCH_RESPONSE, set);

    if (fileSearchQueryDeferred !== '' && emittedValue.current !== fileSearchQueryDeferred) {
      emittedValue.current = fileSearchQueryDeferred;
      channel.emit(FILE_COMPONENT_SEARCH_REQUEST, {
        id: fileSearchQueryDeferred,
        payload: {},
      } satisfies RequestData<FileComponentSearchRequestPayload>);
    } else {
      setSearchResults(null);
      setLoading(false);
    }

    return () => {
      channel.off(FILE_COMPONENT_SEARCH_RESPONSE, set);
    };
  }, [fileSearchQueryDeferred]);

  const handleCreateNewStory = useCallback(
    async ({
      componentExportName,
      componentFilePath,
      componentIsDefaultExport,
      componentExportCount,
      selectedItemId,
    }: NewStoryPayload) => {
      try {
        const channel = addons.getChannel();

        const createNewStoryResult = await experimental_requestResponse<
          CreateNewStoryRequestPayload,
          CreateNewStoryResponsePayload
        >(channel, CREATE_NEW_STORYFILE_REQUEST, CREATE_NEW_STORYFILE_RESPONSE, {
          componentExportName,
          componentFilePath,
          componentIsDefaultExport,
          componentExportCount,
        });

        setError(null);

        const storyId = createNewStoryResult.storyId;

        await trySelectNewStory(api.selectStory, storyId);

        try {
          const argTypesInfoResult = await experimental_requestResponse<
            ArgTypesRequestPayload,
            ArgTypesResponsePayload
          >(channel, ARGTYPES_INFO_REQUEST, ARGTYPES_INFO_RESPONSE, {
            storyId,
          });

          const argTypes = argTypesInfoResult.argTypes;

          const requiredArgs = extractSeededRequiredArgs(argTypes);

          await experimental_requestResponse<SaveStoryRequestPayload, SaveStoryResponsePayload>(
            channel,
            SAVE_STORY_REQUEST,
            SAVE_STORY_RESPONSE,
            {
              args: stringifyArgs(requiredArgs),
              importPath: createNewStoryResult.storyFilePath,
              csfId: storyId,
            }
          );
        } catch (e) {}

        handleSuccessfullyCreatedStory(componentExportName);
        handleFileSearch();
      } catch (e) {
        setError({ selectedItemId: selectedItemId, error: e?.message });
      }
    },
    [api?.selectStory, handleSuccessfullyCreatedStory, handleFileSearch]
  );

  useEffect(() => {
    setError(null);
  }, [fileSearchQueryDeferred]);

  useEffect(() => {
    return handleFileSearch();
  }, [handleFileSearch]);

  return (
    <FileSearchModal
      error={error}
      fileSearchQuery={fileSearchQuery}
      fileSearchQueryDeferred={fileSearchQueryDeferred}
      onCreateNewStory={handleCreateNewStory}
      isLoading={isLoading}
      onOpenChange={onOpenChange}
      open={open}
      searchResults={searchResults}
      setError={setError}
      setFileSearchQuery={setFileSearchQuery}
    />
  );
};
