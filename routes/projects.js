const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const User = require('../models/User'); // Required for user validation in add/remove members
const auth = require('../middleware/auth'); // Middleware for authentication

/**
 * @route POST /api/projects
 * @desc Create a new project
 * @access Private
 */
router.post('/', auth, async (req, res) => {
  try {
    const project = new Project({
      ...req.body, // Spread other project fields from request body
      createdBy: req.user.id, // Set the creator to the authenticated user's ID
      teamMembers: [req.user.id] // Add the creator as the first team member
    });
    await project.save();
    res.status(201).json(project);
  } catch (err) {
    console.error('Error creating project:', err.message);
    res.status(400).json({ message: err.message }); // Send specific validation error messages
  }
});

/**
 * @route GET /api/projects
 * @desc Get all projects accessible by the authenticated user (created by or member of)
 * @access Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { createdBy: req.user.id }, // Projects created by the user
        { teamMembers: req.user.id } // Projects where the user is a team member
      ]
    }).populate('teamMembers', 'name email'); // Populate team members with name and email
    res.json(projects);
  } catch (err) {
    console.error('Error fetching all projects:', err.message);
    res.status(500).json({ message: 'Server error. Could not fetch projects.' });
  }
});

/**
 * @route GET /api/projects/:id
 * @desc Get a specific project by ID
 * @access Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('teamMembers', 'name email') // Populate team members
      .populate('createdBy', 'name email'); // Populate creator

    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Check if the authenticated user has access to this project
    // User must be either the creator or a team member
    const isCreator = project.createdBy._id.toString() === req.user.id;
    const isTeamMember = project.teamMembers.some(member => member._id.toString() === req.user.id);

    if (!isCreator && !isTeamMember) {
      return res.status(403).json({ message: 'Access denied: You are not authorized to view this project.' });
    }

    res.json(project);
  } catch (err) {
    console.error('Error fetching specific project:', err.message);
    res.status(500).json({ message: 'Server error. Could not fetch project details.' });
  }
});

/**
 * @route PUT /api/projects/:id
 * @desc Update a project by ID
 * @access Private (only creator can update)
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Ensure only the project creator can update project details
    if (project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Only the project creator can update project details.' });
    }

    // Update project fields from request body
    Object.assign(project, req.body);
    await project.save(); // Save the updated project
    res.json(project);
  } catch (err) {
    console.error('Error updating project:', err.message);
    res.status(400).json({ message: err.message }); // Send specific validation error messages
  }
});

/**
 * @route DELETE /api/projects/:id
 * @desc Delete a project by ID
 * @access Private (only creator can delete)
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Ensure only the project creator can delete the project
    if (project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Only the project creator can delete this project.' });
    }

    // Use deleteOne() for Mongoose 6+ to remove the document
    await project.deleteOne();
    res.json({ message: 'Project deleted successfully.' });
  } catch (err) {
    console.error('Error deleting project:', err.message);
    res.status(500).json({ message: 'Server error. Could not delete project.' });
  }
});

/**
 * @route POST /api/projects/:id/members
 * @desc Add a team member to a project
 * @access Private (only creator can add members)
 */
router.post('/:id/members', auth, async (req, res) => {
  try {
    const { email } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Ensure only the project creator can add members
    if (project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Only the project creator can add members.' });
    }

    // Find the user to be added by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found with this email.' });
    }

    // Check if the user is already a team member
    if (project.teamMembers.includes(user._id)) {
      return res.status(400).json({ message: 'User is already a team member of this project.' });
    }

    // Add the user's ID to the teamMembers array
    project.teamMembers.push(user._id);
    await project.save(); // Save the updated project

    // Populate the new member's details before sending response
    await project.populate('teamMembers', 'name email');
    res.json(project);
  } catch (err) {
    console.error('Error adding team member:', err.message);
    res.status(400).json({ message: err.message });
  }
});

/**
 * @route DELETE /api/projects/:id/members/:userId
 * @desc Remove a team member from a project
 * @access Private (only creator can remove members)
 */
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }

    // Ensure only the project creator can remove members
    if (project.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Only the project creator can remove members.' });
    }

    // Prevent removing the project creator from the team members list
    if (req.params.userId === project.createdBy.toString()) {
      return res.status(400).json({ message: 'Cannot remove the project creator from the team.' });
    }

    // Filter out the user to be removed from the teamMembers array
    project.teamMembers = project.teamMembers.filter(
      member => member.toString() !== req.params.userId
    );
    await project.save(); // Save the updated project

    // Populate the remaining members before sending response
    await project.populate('teamMembers', 'name email');
    res.json(project);
  } catch (err) {
    console.error('Error removing team member:', err.message);
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
