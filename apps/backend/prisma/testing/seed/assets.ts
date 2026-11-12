/** Creates asset-library rows and walks the database-enforced upload lifecycle without S3. */
import type { PrismaClient } from '../../../src/generated/prisma/client.js';

export type AssetSeed = {
  readyImageId: string;
  readyPdfId: string;
  readyVideoId: string;
};

const IDS = {
  readyImage: '019a0000-0000-7000-8000-000000000301',
  readyPdf: '019a0000-0000-7000-8000-000000000302',
  readyVideo: '019a0000-0000-7000-8000-000000000303',
  failedPdf: '019a0000-0000-7000-8000-000000000304',
  uploadingVideo: '019a0000-0000-7000-8000-000000000305',
  uploadedPdf: '019a0000-0000-7000-8000-000000000306',
  replacementImage: '019a0000-0000-7000-8000-000000000307',
  noFilePdf: '019a0000-0000-7000-8000-000000000308',
  readyImageFile: '019a0000-0000-7000-8000-000000000311',
  readyPdfFile: '019a0000-0000-7000-8000-000000000312',
  readyVideoFile: '019a0000-0000-7000-8000-000000000313',
  failedPdfFile: '019a0000-0000-7000-8000-000000000314',
  uploadingVideoFile: '019a0000-0000-7000-8000-000000000315',
  uploadedPdfFile: '019a0000-0000-7000-8000-000000000316',
  replacementReadyFile: '019a0000-0000-7000-8000-000000000317',
  replacementFailedFile: '019a0000-0000-7000-8000-000000000318',
} as const;

/** Creates all files as UPLOADING and advances each file only through allowed DB transitions. */
export async function seedAssets(prisma: PrismaClient): Promise<AssetSeed> {
  await prisma.$transaction(async (tx) => {
    await tx.asset.createMany({
      data: [
        { id: IDS.readyImage, type: 'IMAGE', title: 'Robot Arm Diagram', status: 'ACTIVE' },
        { id: IDS.readyPdf, type: 'PDF', title: 'Robotics Build Guide', status: 'ACTIVE' },
        { id: IDS.readyVideo, type: 'VIDEO', title: 'Line-Following Robot Demo', status: 'ACTIVE' },
        { id: IDS.failedPdf, type: 'PDF', title: 'Failed Upload Sample', status: 'ACTIVE' },
        {
          id: IDS.uploadingVideo,
          type: 'VIDEO',
          title: 'Processing Queue Sample',
          status: 'ACTIVE',
        },
        { id: IDS.uploadedPdf, type: 'PDF', title: 'Uploaded, Not Ready Sample', status: 'ACTIVE' },
        { id: IDS.replacementImage, type: 'IMAGE', title: 'Replacement Sample', status: 'ACTIVE' },
        { id: IDS.noFilePdf, type: 'PDF', title: 'Asset Without a File', status: 'ACTIVE' },
      ],
    });

    const createUploadingFile = (
      id: string,
      assetId: string,
      filename: string,
      mimeType: string,
      sizeBytes: bigint,
    ) =>
      tx.assetFile.create({
        data: {
          id,
          assetId,
          status: 'UPLOADING',
          storageKey: `assets/${assetId}/${id}/original`,
          originalFilename: filename,
          mimeType,
          sizeBytes,
        },
      });

    await createUploadingFile(
      IDS.readyImageFile,
      IDS.readyImage,
      'robot-arm-diagram.png',
      'image/png',
      24_000n,
    );
    await tx.assetFile.update({
      where: { id: IDS.readyImageFile },
      data: { status: 'UPLOADED' },
    });
    await tx.assetFile.update({
      where: { id: IDS.readyImageFile },
      data: { status: 'READY' },
    });

    await createUploadingFile(
      IDS.readyPdfFile,
      IDS.readyPdf,
      'robotics-build-guide.pdf',
      'application/pdf',
      52_000n,
    );
    await tx.assetFile.update({ where: { id: IDS.readyPdfFile }, data: { status: 'UPLOADED' } });
    await tx.assetFile.update({ where: { id: IDS.readyPdfFile }, data: { status: 'READY' } });

    await createUploadingFile(
      IDS.readyVideoFile,
      IDS.readyVideo,
      'line-following-robot.mp4',
      'video/mp4',
      420_000n,
    );
    await tx.assetFile.update({ where: { id: IDS.readyVideoFile }, data: { status: 'UPLOADED' } });
    await tx.assetFile.update({
      where: { id: IDS.readyVideoFile },
      data: { status: 'PROCESSING' },
    });
    await tx.assetFile.update({
      where: { id: IDS.readyVideoFile },
      data: {
        status: 'READY',
        playbackKey: `assets/${IDS.readyVideo}/${IDS.readyVideoFile}/playback`,
      },
    });

    await createUploadingFile(
      IDS.failedPdfFile,
      IDS.failedPdf,
      'broken-handout.pdf',
      'application/pdf',
      19_000n,
    );
    await tx.assetFile.update({
      where: { id: IDS.failedPdfFile },
      data: { status: 'FAILED', lastError: 'CONTENT_NOT_RECOGNIZED' },
    });

    await createUploadingFile(
      IDS.uploadingVideoFile,
      IDS.uploadingVideo,
      'pending-video.mp4',
      'video/mp4',
      88_000n,
    );

    await createUploadingFile(
      IDS.uploadedPdfFile,
      IDS.uploadedPdf,
      'awaiting-processing.pdf',
      'application/pdf',
      30_000n,
    );
    await tx.assetFile.update({
      where: { id: IDS.uploadedPdfFile },
      data: { status: 'UPLOADED' },
    });

    await createUploadingFile(
      IDS.replacementReadyFile,
      IDS.replacementImage,
      'poster-current.png',
      'image/png',
      26_000n,
    );
    await tx.assetFile.update({
      where: { id: IDS.replacementReadyFile },
      data: { status: 'UPLOADED' },
    });
    await tx.assetFile.update({
      where: { id: IDS.replacementReadyFile },
      data: { status: 'READY' },
    });
    await createUploadingFile(
      IDS.replacementFailedFile,
      IDS.replacementImage,
      'poster-replacement.png',
      'image/png',
      29_000n,
    );
    await tx.assetFile.update({
      where: { id: IDS.replacementFailedFile },
      data: { status: 'FAILED', lastError: 'CONTENT_NOT_RECOGNIZED' },
    });
  });

  return {
    readyImageId: IDS.readyImage,
    readyPdfId: IDS.readyPdf,
    readyVideoId: IDS.readyVideo,
  };
}
