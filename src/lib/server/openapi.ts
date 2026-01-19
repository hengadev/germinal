/**
 * OpenAPI 3.1.0 Specification for Germinal API
 * Automatically generated from API routes
 */

export const openApiSpec = {
	openapi: '3.1.0',
	info: {
		title: 'Germinal API',
		version: '1.0.0',
		description: 'Event and talent management API with reservations, payments, and media',
		contact: {
			name: 'Germinal Support',
			email: 'hello@germinal.com',
			url: 'https://germinal.com'
		}
	},
	license: {
		name: 'MIT',
		url: 'https://opensource.org/licenses/MIT'
	},
	servers: [
		{
			url: process.env.PUBLIC_URL || 'http://localhost:5173',
			description: 'Development server'
		},
		{
			url: 'https://api.germinal.com',
			description: 'Production server'
		}
	],
	tags: [
		{
			name: 'Events',
			description: 'Event management operations'
		},
		{
			name: 'Talents',
			description: 'Talent and artist profiles'
		},
		{
			name: 'Sessions',
			description: 'Event sessions and ticketing'
		},
		{
			name: 'Reservations',
			description: 'Reservation and booking management'
		},
		{
			name: 'Payments',
			description: 'Payment processing with Stripe'
		},
		{
			name: 'Media',
			description: 'Media file uploads and S3 management'
		},
		{
			name: 'Contact',
			description: 'Contact form submissions'
		},
		{
			name: 'Waitlist',
			description: 'Event waitlist management'
		},
		{
			name: 'Admin',
			description: 'Admin panel operations'
		},
		{
			name: 'Webhooks',
			description: 'External webhook handlers'
		}
	],
	paths: {
		'/api/events': {
			get: {
				tags: ['Events'],
				summary: 'List all events',
				description: 'Retrieves a paginated list of events',
				parameters: [
					{
						name: 'published',
						in: 'query',
						schema: {
							type: 'boolean',
							default: true,
							description: 'Filter to show only published events'
						}
					},
					{
						name: 'page',
						in: 'query',
						schema: {
							type: 'integer',
							minimum: 1,
							default: 1,
							description: 'Page number for pagination'
						}
					},
					{
						name: 'limit',
						in: 'query',
						schema: {
							type: 'integer',
							minimum: 1,
							maximum: 100,
							default: 20,
							description: 'Number of events per page'
						}
					}
				],
				responses: {
					200: {
						description: 'Successful response',
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										data: {
											type: 'array',
											items: {
												$ref: '#/components/schemas/Event'
											}
										},
										pagination: {
											$ref: '#/components/schemas/Pagination'
										}
									}
								}
							}
						}
					}
				}
			},
			post: {
				tags: ['Events', 'Admin'],
				summary: 'Create a new event',
				description: 'Creates a new event in the system',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: ['title', 'slug', 'description', 'startDate', 'endDate', 'location'],
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/CreateEvent'
							}
						}
					}
				},
				responses: {
					201: {
						description: 'Event created successfully',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Event'
								}
							}
						}
					},
					400: {
						description: 'Validation error',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					}
				}
			},
			'/api/talents': {
				get: {
					tags: ['Talents'],
					summary: 'List all talents',
					description: 'Retrieves a paginated list of talents',
					parameters: [
						{
							name: 'published',
							in: 'query',
							schema: {
								type: 'boolean',
								default: true,
								description: 'Filter to show only published talents'
							}
						},
						{
							name: 'page',
							in: 'query',
							schema: {
								type: 'integer',
								minimum: 1,
								default: 1,
								description: 'Page number for pagination'
							}
						},
						{
							name: 'limit',
							in: 'query',
							schema: {
								type: 'integer',
								minimum: 1,
								maximum: 100,
								default: 20,
								description: 'Number of talents per page'
							}
						}
					],
					responses: {
						200: {
							description: 'Successful response',
							content: {
								'application/json': {
										schema: {
											type: 'object',
											properties: {
												data: {
													type: 'array',
													items: {
														$ref: '#/components/schemas/Talent'
													}
												},
												pagination: {
													$ref: '#/components/schemas/Pagination'
												}
											}
										}
								}
							}
						}
					}
				},
				post: {
					tags: ['Talents', 'Admin'],
					summary: 'Create a new talent profile',
					description: 'Creates a new talent/artist profile in the system',
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: ['firstName', 'lastName', 'role', 'bio'],
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/CreateTalent'
								}
							}
						}
					},
					responses: {
						201: {
							description: 'Talent created successfully',
							content: {
								'application/json': {
										schema: {
											$ref: '#/components/schemas/Talent'
										}
									}
							}
						}
					},
					400: {
						description: 'Validation error',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					}
				}
			},
			'/api/reservations/create': {
				post: {
					tags: ['Reservations'],
					summary: 'Create a new reservation',
					description: 'Creates a new reservation with initial pending status and initiates Stripe payment',
					security: [{ bearerAuth: [], csrfToken: [] }],
					requestBody: {
						required: ['sessionId', 'email', 'name', 'quantity'],
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/CreateReservation'
								}
							}
						}
					},
					responses: {
						201: {
							description: 'Reservation created successfully',
							content: {
								'application/json': {
										schema: {
											type: 'object',
											properties: {
												reservationId: {
													type: 'string',
													format: 'uuid'
												},
												clientSecret: {
													type: 'string',
													description: 'Stripe client secret for frontend'
												},
												expiresAt: {
													type: 'string',
													format: 'date-time'
												},
												accessToken: {
													type: 'string'
												}
										}
									}
								}
							}
						}
					},
					400: {
						description: 'Validation error or sold out',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					},
					409: {
						description: 'Event is sold out',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					}
				}
			},
			'/api/waitlist/join': {
				post: {
					tags: ['Reservations'],
					summary: 'Join event waitlist',
					description: 'Adds user to event session waitlist when sold out',
					security: [{ csrfToken: [] }],
					requestBody: {
						required: ['sessionId', 'email', 'name', 'quantity'],
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/JoinWaitlist'
								}
							}
						}
					},
					responses: {
						201: {
							description: 'Successfully added to waitlist',
							content: {
								'application/json': {
										schema: {
											type: 'object',
											properties: {
												entryId: {
													type: 'string',
													format: 'uuid'
												}
											}
									}
								}
							}
						}
					},
					400: {
						description: 'Validation error or waitlist full',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					},
					409: {
						description: 'Waitlist full',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error'
								}
							}
						}
					}
				}
			},
			'/api/media/upload': {
				post: {
					tags: ['Media', 'Admin'],
					summary: 'Upload media files',
					description: 'Uploads images or videos to S3 storage',
					security: [{ bearerAuth: [], csrfToken: [] }],
					requestBody: {
						required: ['entityType', 'entityId'],
						content: {
							'application/json': {
								schema: {
									type: 'object',
									properties: {
										entityType: {
											type: 'string',
											enum: ['event', 'talent'],
											description: 'Type of entity (event or talent) to attach media to'
										},
										entityId: {
											type: 'string',
											format: 'uuid',
											description: 'ID of the event or talent'
										},
										files: {
											type: 'array',
											description: 'Array of files to upload',
											items: {
												type: 'string',
												format: 'binary',
												description: 'File data in binary format'
											}
										}
									}
								}
							}
						}
					},
					responses: {
						201: {
							description: 'Files uploaded successfully',
							content: {
								'application/json': {
										schema: {
											type: 'object',
											properties: {
												media: {
													type: 'array',
													items: {
														$ref: '#/components/schemas/Media'
													}
												}
											}
										}
									}
								}
							}
						},
						400: {
							description: 'Validation error or file too large',
							content: {
								'application/json': {
										schema: {
											$ref: '#/components/schemas/Error'
										}
									}
								}
							}
						}
					}
				}
			},
			'/api/contact': {
				post: {
					tags: ['Contact'],
					summary: 'Submit contact form',
					description: 'Submits a new contact form message',
					security: [{ csrfToken: [] }],
					requestBody: {
						required: ['name', 'email', 'message', 'inquiryType'],
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/ContactSubmission'
								}
							}
						}
					},
					responses: {
						200: {
							description: 'Contact form submitted successfully',
							content: {
								'text/plain': 'Thank you for your message. We will get back to you soon!'
							}
						},
						400: {
							description: 'Validation error',
							content: {
								'application/json': {
										schema: {
											$ref: '#/components/schemas/Error'
										}
									}
								}
							}
						}
					}
				}
			},
			'/api/webhooks/stripe': {
				post: {
					tags: ['Webhooks'],
					summary: 'Stripe webhook handler',
					description: 'Handles Stripe payment webhooks',
					security: [
						{
							'x-api-key': []
						}
					],
					requestBody: {
						description: 'Stripe webhook payload',
						content: {
							'application/json': {
								example: {
									id: 'evt_1234567890',
									object: {
										data: {
											object_id: 'evt_1234567890',
											id: 'pi_3234567890',
											amount: 5000,
											currency: 'usd',
											status: 'succeeded',
											livemode: false
										}
									}
								}
							}
						}
					},
					responses: {
						200: {
							description: 'Webhook processed successfully',
							content: {
								'text/plain': 'Received'
							}
						}
					}
				}
			}
		},
	components: {
		schemas: {
			Error: {
				type: 'object',
				properties: {
					error: {
						type: 'string',
						description: 'Human-readable error message'
					},
					code: {
						type: 'string',
						description: 'Machine-readable error code',
						example: 'VALIDATION_ERROR'
					},
					details: {
						type: 'object',
						description: 'Additional error details, often validation field errors'
					}
				},
				required: true
			},
			Event: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						format: 'uuid',
						description: 'Unique event identifier'
					},
					title: {
						type: 'string',
						description: 'Event title'
					},
					slug: {
						type: 'string',
						description: 'URL-friendly event identifier',
						example: 'summer-music-festival'
					},
					description: {
						type: 'string',
						description: 'Event description'
					},
					startDate: {
						type: 'string',
						format: 'date-time',
						description: 'Event start date and time'
					},
					endDate: {
						type: 'string',
						format: 'date-time',
						description: 'Event end date and time'
					},
					location: {
						type: 'string',
						description: 'Event location'
					},
					coverMedia: {
						$ref: '#/components/schemas/Media'
					},
					published: {
						type: 'boolean',
						description: 'Whether the event is published'
					}
				},
				Talent: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						format: 'uuid',
						description: 'Unique talent identifier'
					},
					firstName: {
						type: 'string',
						description: 'Talent first name'
					},
					lastName: {
						type: 'string',
						description: 'Talent last name'
					},
					role: {
						type: 'string',
						description: 'Talent role or profession'
					},
					bio: {
						type: 'string',
						description: 'Talent biography'
					},
					profileMedia: {
						$ref: '#/components/schemas/Media'
					},
					published: {
						type: 'boolean',
						description: 'Whether the talent profile is published'
					}
				},
				Session: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						format: 'uuid',
						description: 'Unique session identifier'
					},
					eventId: {
						type: 'string',
						format: 'uuid',
						description: 'Associated event ID'
					},
					title: {
						type: 'string',
						description: 'Session title'
					},
					startTime: {
						type: 'string',
						format: 'date-time',
						description: 'Session start date and time'
					},
					endTime: {
						type: 'string',
						format: 'date-time',
						description: 'Session end date and time'
					},
					priceAmount: {
						type: 'integer',
						description: 'Ticket price in cents',
						example: 2500
					},
					currency: {
						type: 'string',
						description: 'Three-letter currency code',
						default: 'EUR',
						example: 'USD'
					},
					totalCapacity: {
						type: 'integer',
						description: 'Total number of available tickets',
						example: 100
					},
					availableCapacity: {
						type: 'integer',
						description: 'Number of tickets currently available',
						example: 50
					},
					allowWaitlist: {
						type: 'boolean',
						description: 'Whether waitlist is enabled for this session'
					},
					published: {
						type: 'boolean',
						description: 'Whether the session is published'
					}
				},
				CreateEvent: {
					type: 'object',
					required: ['title', 'slug', 'description', 'startDate', 'endDate', 'location'],
					properties: {
						title: {
							type: 'string',
							minLength: 1,
							maxLength: 255,
							description: 'Event title'
						},
						slug: {
							type: 'string',
							pattern: '^[a-z0-9-]+$',
							maxLength: 255,
							description: 'URL-friendly slug for the event'
						},
						description: {
							type: 'string',
							minLength: 1,
							description: 'Event description'
						},
						startDate: {
							type: 'string',
							format: 'date-time',
							description: 'Event start date and time'
						},
						endDate: {
							type: 'string',
							format: 'date-time',
							description: 'Event end date and time'
						},
						location: {
							type: 'string',
							description: 'Event location'
						},
						published: {
							type: 'boolean',
							description: 'Whether the event should be published immediately'
						}
					}
				},
				CreateTalent: {
					type: 'object',
					required: ['firstName', 'lastName', 'role', 'bio'],
					properties: {
						firstName: {
							type: 'string',
							minLength: 1,
							maxLength: 100,
							description: 'Talent first name'
						},
						lastName: {
							type: 'string',
							minLength: 1,
							maxLength: 100,
							description: 'Talent last name'
						},
						role: {
							type: 'string',
							minLength: 1,
							maxLength: 150,
							description: 'Talent role or profession'
						},
						bio: {
							type: 'string',
							minLength: 1,
							description: 'Talent biography'
						},
						published: {
							type: 'boolean',
							description: 'Whether the talent profile should be published immediately'
						}
					}
				},
				CreateReservation: {
					type: 'object',
					required: ['sessionId', 'email', 'name', 'quantity'],
					properties: {
						sessionId: {
							type: 'string',
							format: 'uuid',
							description: 'Event session ID'
						},
						email: {
							type: 'string',
							format: 'email',
							description: 'User email address'
						},
						name: {
							type: 'string',
							minLength: 1,
							maxLength: 255,
							description: 'User full name'
						},
						quantity: {
							type: 'integer',
							minimum: 1,
							maximum: 10,
							description: 'Number of tickets to reserve'
						}
					}
				},
				JoinWaitlist: {
					type: 'object',
					required: ['sessionId', 'email', 'name', 'quantity'],
					properties: {
						sessionId: {
							type: 'string',
							format: 'uuid',
							description: 'Event session ID'
						},
						email: {
							type: 'string',
							format: 'email',
							description: 'User email address'
						},
						name: {
							type: 'string',
							minLength: 1,
							maxLength: 255,
							description: 'User full name'
						},
						quantity: {
							type: 'integer',
							minimum: 1,
							maximum: 10,
							description: 'Number of tickets to waitlist'
						}
					}
				},
				ContactSubmission: {
					type: 'object',
					required: ['name', 'email', 'message', 'inquiryType'],
					properties: {
						name: {
							type: 'string',
							minLength: 1,
							maxLength: 255,
							description: 'Submitter name'
						},
						email: {
							type: 'string',
							format: 'email',
							description: 'Submitter email address'
						},
						company: {
							type: 'string',
							maxLength: 255,
							description: 'Submitter company or organization'
						},
						message: {
							type: 'string',
							minLength: 1,
							description: 'Contact message'
						},
						inquiryType: {
							type: 'string',
							enum: ['collaboration', 'new_project', 'join_roster', 'other'],
							description: 'Type of inquiry'
						}
					}
				},
				Media: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
							format: 'uuid',
							description: 'Unique media identifier'
						},
						type: {
							type: 'string',
							enum: ['image', 'video'],
							description: 'Media type (image or video)'
						},
						url: {
							type: 'string',
							format: 'uri',
							description: 'Public URL for accessing the media file'
						},
						s3Key: {
							type: 'string',
							description: 'S3 object key for the file'
						},
						mimeType: {
							type: 'string',
							description: 'MIME type of the file'
						},
						size: {
							type: 'integer',
							description: 'File size in bytes'
						},
						createdAt: {
							type: 'string',
							format: 'date-time',
							description: 'Creation timestamp'
						},
						eventId: {
							type: 'string',
							format: 'uuid',
							description: 'Associated event ID (if applicable)'
						},
						talentId: {
							type: 'string',
							format: 'uuid',
							description: 'Associated talent ID (if applicable)'
						},
						isCover: {
							type: 'boolean',
							description: 'Whether this is the cover image/video'
						}
					}
				},
				Pagination: {
					type: 'object',
					properties: {
						page: {
							type: 'integer',
							minimum: 1,
							description: 'Current page number'
						},
						limit: {
							type: 'integer',
							minimum: 1,
							maximum: 100,
							description: 'Items per page'
						},
						total: {
							type: 'integer',
							description: 'Total number of items'
						},
						totalPages: {
							type: 'integer',
							description: 'Total number of pages'
						},
						hasNextPage: {
							type: 'boolean',
							description: 'Whether there is a next page'
						},
						hasPreviousPage: {
							type: 'boolean',
							description: 'Whether there is a previous page'
						}
					},
					required: ['page', 'limit', 'total']
				}
			}
	}
};
