import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/passwords";

const prisma = new PrismaClient();

async function main() {
  await prisma.organization.upsert({
    where: { slug: "helios-community" },
    update: { name: "Helios Community Foundation" },
    create: {
      slug: "helios-community",
      name: "Helios Community Foundation",
    },
  });

  const redwood = await prisma.organization.upsert({
    where: { slug: "redwood-health" },
    update: { name: "Redwood Health Collaborative" },
    create: {
      slug: "redwood-health",
      name: "Redwood Health Collaborative",
    },
  });

  const helios = await prisma.organization.findUniqueOrThrow({ where: { slug: "helios-community" } });
  await prisma.user.upsert({
    where: { email: "helios@grantops.demo" },
    update: { passwordHash: hashPassword("helios-demo"), organizationId: helios.id },
    create: {
      email: "helios@grantops.demo",
      name: "Helios reviewer",
      passwordHash: hashPassword("helios-demo"),
      organizationId: helios.id,
    },
  });
  await prisma.user.upsert({
    where: { email: "redwood@grantops.demo" },
    update: { passwordHash: hashPassword("redwood-demo"), organizationId: redwood.id },
    create: {
      email: "redwood@grantops.demo",
      name: "Redwood reviewer",
      passwordHash: hashPassword("redwood-demo"),
      organizationId: redwood.id,
    },
  });

  const heliosRecord = await prisma.clientRecord.findFirst({
    where: { organizationId: helios.id, title: "Helios organization facts" },
  });
  if (!heliosRecord) {
    await prisma.clientRecord.create({
      data: {
        organizationId: helios.id,
        title: "Helios organization facts",
        body: "Helios Community Foundation is a Texas 501(c)(3). It may apply for workforce training grants in Hidalgo County. The workforce center request is $250,000 with a 10 percent match. Grant funds must not be used for residential housing. The organization can serve at least 80 adult residents.",
      },
    });
  }
  const redwoodRecord = await prisma.clientRecord.findFirst({
    where: { organizationId: redwood.id, title: "Redwood organization facts" },
  });
  if (!redwoodRecord) {
    await prisma.clientRecord.create({
      data: {
        organizationId: redwood.id,
        title: "Redwood organization facts",
        body: "Redwood Health Collaborative operates rural clinics in East Texas. It does not run workforce training centers and does not request Community Development Block Grant workforce funds. Its programs are clinical services, not job training.",
      },
    });
  }

  const hidden = await prisma.grantProject.findFirst({
    where: { organizationId: redwood.id, title: "Rural Clinic Expansion" },
  });
  if (!hidden) {
    await prisma.grantProject.create({
      data: {
        organizationId: redwood.id,
        title: "Rural Clinic Expansion",
        funder: "Redwood Family Trust",
        status: "CREATED",
        events: {
          create: {
            toStatus: "CREATED",
            reason: "Seeded outside the Helios workspace.",
          },
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
