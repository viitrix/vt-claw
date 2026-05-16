import { error } from "@sveltejs/kit";
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { getShareFolder } from "$lib/server/claw-client.js";

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
      message: "File type should be JPEG or PNG",
    }),
});

export async function POST({ request, url, locals: { user } }) {
  if (!user) {
    error(401, "Unauthorized");
  }

  if (request.body === null) {
    error(400, "Empty file received");
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return error(400, "No file uploaded");
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((e) => e.message)
        .join(", ");
      return error(400, errorMessage);
    }

    const filename = basename(file.name);
    const shareFolder = await getShareFolder(user.id);

    if (!shareFolder) {
      return error(500, "Failed to resolve share folder");
    }

    const receivedDir = join(shareFolder, "received");
    if (!existsSync(receivedDir)) {
      await mkdir(receivedDir, { recursive: true });
    }

    const filePath = join(receivedDir, filename);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, fileBuffer);

    const downloadPath = `/api/files/download/${user.id}/received/${encodeURIComponent(filename)}`;
    return Response.json({
      url: `${url.origin}${downloadPath}`,
      pathname: filename,
      contentType: file.type,
    });
  } catch (e) {
    console.error(e);
    return error(500, "Upload failed");
  }
}
