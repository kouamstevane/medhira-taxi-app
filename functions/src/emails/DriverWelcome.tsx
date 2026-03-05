import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Button,
} from "@react-email/components";

interface DriverWelcomeEmailProps {
  firstName: string;
}

export const DriverWelcomeEmail = ({
  firstName = "Chauffeur",
}: DriverWelcomeEmailProps) => {
  const previewText = `Bienvenue chez MedJira, ${firstName} ! Votre candidature a bien été reçue.`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Bienvenue chez MedJira</Heading>
          <Text style={text}>Bonjour {firstName},</Text>
          <Text style={text}>
            Nous sommes ravis de vous compter parmi nous ! Votre candidature pour devenir chauffeur MedJira a bien été reçue et est actuellement en cours de traitement par nos services de conformité.
          </Text>
          
          <Section style={stepsContainer}>
            <Heading as="h2" style={h2}>Prochaines étapes :</Heading>
            <ul style={list}>
              <li style={listItem}>Vérification de vos documents (Permis, Assurance, Carte Grise)</li>
              <li style={listItem}>Validation technique de votre véhicule</li>
              <li style={listItem}>Activation de votre compte chauffeur</li>
            </ul>
          </Section>

          <Text style={text}>
            Vous recevrez un e-mail dès que votre profil sera validé ou si des informations complémentaires sont nécessaires.
          </Text>

          <Section style={btnContainer}>
            <Button
              style={button}
              href="https://medjira.app/driver/dashboard"
            >
              Suivre mon dossier
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Ceci est un message automatique, merci de ne pas y répondre directement.
            <br />
            L'équipe MedJira
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default DriverWelcomeEmail;

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const h1 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  textAlign: "center" as const,
  margin: "30px 0",
};

const h2 = {
  color: "#444",
  fontSize: "18px",
  fontWeight: "bold",
  margin: "20px 0 10px",
};

const text = {
  color: "#555",
  fontSize: "16px",
  lineHeight: "26px",
  textAlign: "left" as const,
  padding: "0 40px",
};

const stepsContainer = {
  padding: "0 40px",
};

const list = {
  color: "#555",
  fontSize: "16px",
  lineHeight: "26px",
};

const listItem = {
  marginBottom: "10px",
};

const btnContainer = {
  textAlign: "center" as const,
  marginTop: "32px",
};

const button = {
  backgroundColor: "#000000",
  borderRadius: "5px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "20px 0",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  textAlign: "center" as const,
  padding: "0 40px",
};
