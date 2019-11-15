package servlets;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.TreeSet;

import javax.servlet.ServletOutputStream;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.TransformerException;

import org.apache.commons.io.IOUtils;
import org.apache.http.HttpStatus;
import org.sbolstandard.core2.SBOLConversionException;
import org.sbolstandard.core2.SBOLValidationException;
import org.synbiohub.frontend.IdentifiedMetadata;
import org.synbiohub.frontend.SearchCriteria;
import org.synbiohub.frontend.SearchQuery;
import org.synbiohub.frontend.SynBioHubException;
import org.synbiohub.frontend.SynBioHubFrontend;
import org.synbiohub.frontend.WebOfRegistriesData;
import org.xml.sax.SAXException;

import com.google.gson.Gson;

import utils.Converter;
import utils.SBOLData;

@SuppressWarnings("serial")
@WebServlet(urlPatterns = { "/SynBioHub/*" })
public class SynBioHub extends HttpServlet {

	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
		Gson gson = new Gson();
		try {
			String body = null;
			// parameters for the different methods
			String authorization = request.getHeader("Authorization");
			String email = null;
			String password = null;
			String user = null;
			if (authorization != null && authorization.split(":").length > 1) {
				String[] tokens = authorization.split(":");
				email = tokens[0];
				password = tokens[1];
			} else {
				user = authorization;
			}
			String server = request.getParameter("server");

			if (request.getPathInfo().equals("/registries")) {

				List<WebOfRegistriesData> registries = null;
				registries = SynBioHubFrontend.getRegistries();
				LinkedList<String> registryURLs = new LinkedList<String>();
				for (WebOfRegistriesData registry : registries) {
					registryURLs.add(registry.getInstanceUrl());
				}
				body = gson.toJson(registryURLs);

			} else if (request.getPathInfo().equals("/login")) {

				if (email == null || password == null || server == null || email.equals("") || password.equals("")
						|| server.equals("")) {
					response.setStatus(HttpStatus.SC_BAD_REQUEST);
					return;
				}
				SynBioHubFrontend sbhf = new SynBioHubFrontend(server);
				try {
					sbhf.login(email, password);
				} catch (SynBioHubException e) {
					if (e.getMessage().equals("org.synbiohub.frontend.PermissionException")) {
						response.setStatus(HttpStatus.SC_UNAUTHORIZED);
						return;
					}
					throw e;
				}
				user = sbhf.getUser();
				body = user;

			} else if (request.getPathInfo().equals("/listMyCollections")) {

				if (server == null || user == null) {
					response.setStatus(HttpStatus.SC_BAD_REQUEST);
					return;
				}
				SynBioHubFrontend sbhf = new SynBioHubFrontend(server);
				sbhf.setUser(user);
				List<IdentifiedMetadata> collections = sbhf.getRootCollectionMetadata();
				collections.removeIf(collection -> (collection.getUri().contains("/public/")));
				body = gson.toJson(collections);

			} else if (request.getPathInfo().equals("/listRegistryParts")) {
				String collection = request.getParameter("collection");
				String type = request.getParameter("type");
				String role = request.getParameter("role");
				String mode = request.getParameter("mode");

				if (mode == null) {
					response.setStatus(HttpStatus.SC_BAD_REQUEST);
					return;
				}

				SynBioHubFrontend sbhf = new SynBioHubFrontend(server);
				if (user != null)
					sbhf.setUser(user);

				TreeSet<URI> roles = null;
				TreeSet<URI> types = null;
				TreeSet<URI> collections = null;
				if (role != null) {
					roles = new TreeSet<URI>();
					if (SBOLData.roles.ContainsKey(role))
						roles.add(SBOLData.roles.getValue(role));
					else
						roles.add(SBOLData.refinements.getValue(role));
				}
				if (type != null) {
					types = new TreeSet<URI>();
					types.add(SBOLData.types.getValue(type));
				}
				if (collection != null) {
					collections = new TreeSet<URI>();
					collections.add(URI.create(collection));
				}

				ArrayList<IdentifiedMetadata> results = new ArrayList<IdentifiedMetadata>();
				if (mode.equals("collections")) {
					if (collections == null) {
						results.addAll(sbhf.getRootCollectionMetadata());
					} else {
						for (URI collectionURI : collections) {
							results.addAll(sbhf.getSubCollectionMetadata(collectionURI));
						}
					}
				} else if (mode.equals("components") && collections != null) {
					results.addAll(
							sbhf.getMatchingComponentDefinitionMetadata(null, roles, types, collections, null, null));
				} else if (mode.equals("modules") && collections != null) {
					// SynbioHubFrontend doesn't have anything easy for modules
					SearchQuery query = new SearchQuery();

					SearchCriteria objectCriteria = new SearchCriteria();
					objectCriteria.setKey("objectType");
					objectCriteria.setValue("ModuleDefinition");
					query.addCriteria(objectCriteria);

					if (roles != null) {
						for (URI uri : roles) {
							SearchCriteria roleCriteria = new SearchCriteria();
							roleCriteria.setKey("role");
							roleCriteria.setValue(uri.toString());
							query.getCriteria().add(roleCriteria);
						}
					}

					if (types != null) {
						for (URI uri : types) {
							SearchCriteria typeCriteria = new SearchCriteria();
							typeCriteria.setKey("type");
							typeCriteria.setValue(uri.toString());
							query.getCriteria().add(typeCriteria);
						}
					}

					if (collections != null) {
						for (URI uri : collections) {
							SearchCriteria collectionCriteria = new SearchCriteria();
							collectionCriteria.setKey("collection");
							collectionCriteria.setValue(uri.toString());
							query.getCriteria().add(collectionCriteria);
						}
					}

					results.addAll(sbhf.search(query));
				}

				body = gson.toJson(results.toArray(new IdentifiedMetadata[0]));

			} else if (request.getPathInfo().equals("/getRegistryPart")) {
				String uri = request.getParameter("uri");
				if (uri == null) {
					response.setStatus(HttpStatus.SC_BAD_REQUEST);
					return;
				}

				SynBioHubFrontend sbhf = new SynBioHubFrontend(server);
				sbhf.setUser(user);
				Converter converter = new Converter();
				converter.toGraph(sbhf.getSBOL(URI.create(uri), true), response.getOutputStream());
				response.setStatus(HttpStatus.SC_OK);
				return;
			} else {
				response.setStatus(HttpStatus.SC_BAD_REQUEST);
				return;
			}

			ServletOutputStream outputStream = response.getOutputStream();
			InputStream inputStream = new ByteArrayInputStream(body.getBytes());
			IOUtils.copy(inputStream, outputStream);

			// the request was good
			response.setStatus(HttpStatus.SC_OK);
			response.setContentType("application/json");
			return;
		} catch (SynBioHubException | IOException | ParserConfigurationException | TransformerException | SBOLValidationException e) {
			ServletOutputStream outputStream = response.getOutputStream();
			InputStream inputStream = new ByteArrayInputStream(e.getMessage().getBytes());
			IOUtils.copy(inputStream, outputStream);

			response.setStatus(HttpStatus.SC_INTERNAL_SERVER_ERROR);
		}
	}

	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {
		try {
			String server = request.getParameter("server");
			String user = request.getHeader("Authorization");
			String uri = request.getParameter("uri");
			String name = request.getParameter("name");

			if (request.getPathInfo().equals("/addToCollection")) {

				if (server == null || user == null || uri == null || name == null) {
					response.setStatus(HttpStatus.SC_BAD_REQUEST);
					return;
				}
				SynBioHubFrontend sbhf = new SynBioHubFrontend(server);
				sbhf.setUser(user);
				Converter converter = new Converter();
				ByteArrayOutputStream out = new ByteArrayOutputStream();
				converter.toSBOL(request.getInputStream(), out, name);
				sbhf.addToCollection(URI.create(uri), true, new ByteArrayInputStream(out.toByteArray()));
				response.setStatus(HttpStatus.SC_CREATED);

			}

		} catch (SynBioHubException | SAXException | IOException | ParserConfigurationException
				| SBOLValidationException | SBOLConversionException e) {
			ServletOutputStream outputStream = response.getOutputStream();
			InputStream inputStream = new ByteArrayInputStream(e.getMessage().getBytes());
			IOUtils.copy(inputStream, outputStream);

			response.setStatus(HttpStatus.SC_INTERNAL_SERVER_ERROR);
		}

	}

}
