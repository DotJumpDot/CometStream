import { memo, useMemo } from "react";
import FileDownloadCard from "../../FileDownloadCard";
import ImageGenerationCard from "../../ImageGenerationCard";
import ScheduledJobCreatedCard from "../../ScheduledJobCreatedCard";

/**
 * Generated-file download payload type names end in FileDownload
 * (TextFileDownload, PptxFileDownload, ...).
 */
function isFileDownloadOutput(output) {
  return typeof output?.type === "string" && /FileDownload$/.test(output.type);
}

/**
 * Renders persisted turn outputs below the reply, one card per file. When
 * the turn's trace already carries the download cards (new turns), those
 * payloads render interleaved in the trace instead and are skipped here to
 * avoid showing every file twice.
 */
function HistoricalOutputs({ outputs = [], trace = [] }) {
  const traceHasDownloads = useMemo(
    () =>
      Array.isArray(trace) &&
      trace.some((event) => event?.type === "fileDownloadCard"),
    [trace]
  );

  const rows = useMemo(() => {
    if (!outputs || outputs.length === 0) return [];
    const list = [];
    outputs.forEach((output, index) => {
      const key = `${output.type}-${index}`;
      if (output.type === "imageGenerationCard") {
        list.push({
          key,
          element: <ImageGenerationCard props={{ content: output.payload }} />,
        });
        return;
      }
      if (output.type === "scheduledJobCreated") {
        list.push({
          key,
          element: (
            <ScheduledJobCreatedCard props={{ content: output.payload }} />
          ),
        });
        return;
      }
      if (isFileDownloadOutput(output)) {
        // Interleaved trace rendering supersedes the flat outputs list.
        if (traceHasDownloads) return;
        list.push({
          key,
          element: <FileDownloadCard props={{ content: output.payload }} />,
        });
        return;
      }
      list.push({
        key,
        element: <FileDownloadCard props={{ content: output.payload }} />,
      });
    });
    return list.map((row) => <div key={row.key}>{row.element}</div>);
  }, [outputs, traceHasDownloads]);

  if (rows.length === 0) return null;
  return <div className="flex flex-col gap-2 mt-4">{rows}</div>;
}

export default memo(HistoricalOutputs);
